"""Writing players, memberships and season UTRs.

Everything that changes data goes through here, so the rules that guard a
write — the season lock especially — are stated once instead of being repeated
at each call site and eventually forgotten at one of them.

Callers get exceptions rather than HTTP status codes: the routes translate.
That keeps this module usable from the migration command and the tests without
a request in sight.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models import (
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    SeasonLock,
    Season,
    Team,
)


class NotFound(LookupError):
    """No such player, team or membership."""


class Conflict(ValueError):
    """The write contradicts something already stored (a duplicate, usually)."""


class SeasonLocked(PermissionError):
    """The season has been frozen.

    Its own type, and its message names the season: a caller told only
    "forbidden" would go looking for a permissions problem, when the real
    answer is that the matches were already played under these numbers.
    """


#: Distinguishes "field not passed" from "field set to None". `None` is a real,
#: meaningful value for these nullable fields (clear the school; unmark a flag),
#: so absence needs its own token.
_UNSET = object()


def _require_player(session: Session, player_id: int) -> Player:
    player = session.get(Player, player_id)
    if player is None:
        raise NotFound(f"no player {player_id}")
    return player


def set_team_school_count(
    session: Session, team_id: int, school_count: Optional[int]
) -> Team:
    """Set how many schools a (联队) team combines. None clears it (unset)."""
    team = session.get(Team, team_id)
    if team is None:
        raise NotFound(f"no team {team_id}")
    team.school_count = school_count
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


def _assert_season_open(session: Session, season_year: int) -> None:
    """One place, not one per write path.

    Every mutation that touches a season funnels through here; scattering the
    check would mean the next write path added is the one that forgets it.
    """
    if session.get(SeasonLock, season_year) is not None:
        raise SeasonLocked(f"season {season_year} is locked")


def _locked_seasons_for(session: Session, player_id: int) -> list[int]:
    """Which frozen seasons this player has records in."""
    from_utrs = session.exec(
        select(PlayerSeasonUtr.season_year).where(
            PlayerSeasonUtr.player_id == player_id
        )
    ).all()
    from_teams = session.exec(
        select(Team.season_year)
        .join(
            PlayerTeamMembership, PlayerTeamMembership.team_id == Team.id
        )
        .where(PlayerTeamMembership.player_id == player_id)
    ).all()

    years = set(from_utrs) | set(from_teams)
    if not years:
        return []
    locked = session.exec(
        select(SeasonLock.season_year).where(SeasonLock.season_year.in_(years))
    ).all()
    return sorted(locked)


def create_player(session: Session, **fields) -> Player:
    player = Player(**fields)
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


def update_player(session: Session, player_id: int, **fields) -> Player:
    player = _require_player(session, player_id)
    for name, value in fields.items():
        # Only what the caller actually sent: a PATCH that echoed every column
        # would blank the ones it did not mention.
        setattr(player, name, value)
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


def delete_player(session: Session, player_id: int) -> None:
    """Remove a player outright.

    Refused when any of their records belong to a locked season: those are the
    seasons whose matches were already played, and deleting the person would
    rewrite what happened. A player nobody has played with leaves no trace, so
    deleting them is safe and needs no soft-delete state.
    """
    player = _require_player(session, player_id)
    locked = _locked_seasons_for(session, player_id)
    if locked:
        raise SeasonLocked(
            f"player has records in locked season(s): "
            f"{', '.join(str(y) for y in locked)}"
        )

    session.execute(
        PlayerSeasonUtr.__table__.delete().where(
            PlayerSeasonUtr.player_id == player_id
        )
    )
    session.execute(
        PlayerTeamMembership.__table__.delete().where(
            PlayerTeamMembership.player_id == player_id
        )
    )
    session.delete(player)
    session.commit()


def add_membership(
    session: Session,
    player_id: int,
    team_id: int,
    representing_school: Optional[str] = None,
    is_borrowed_player: Optional[bool] = None,
    is_wildcard: Optional[bool] = None,
) -> PlayerTeamMembership:
    _require_player(session, player_id)
    team = session.get(Team, team_id)
    if team is None:
        raise NotFound(f"no team {team_id}")
    _assert_season_open(session, team.season_year)

    existing = session.exec(
        select(PlayerTeamMembership).where(
            PlayerTeamMembership.player_id == player_id,
            PlayerTeamMembership.team_id == team_id,
        )
    ).one_or_none()
    if existing is not None:
        raise Conflict("this player is already on that team")

    membership = PlayerTeamMembership(
        player_id=player_id,
        team_id=team_id,
        representing_school=representing_school,
        is_borrowed_player=is_borrowed_player,
        is_wildcard=is_wildcard,
    )
    session.add(membership)
    session.commit()
    session.refresh(membership)
    return membership


def update_membership(
    session: Session,
    player_id: int,
    team_id: int,
    *,
    is_borrowed_player: Optional[bool] = _UNSET,
    is_wildcard: Optional[bool] = _UNSET,
    representing_school: Optional[str] = _UNSET,
) -> PlayerTeamMembership:
    """Change the team-level identity fields on an existing membership, located
    by (player, team). Only the fields actually passed are touched.

    A borrowed or wildcard player has no home school to represent, so marking
    either true clears representing_school here — the backend does not trust the
    caller to keep those consistent (the UI disables the school control, but a
    direct API call must not be able to leave a borrowed player with a school).
    """
    membership = session.exec(
        select(PlayerTeamMembership).where(
            PlayerTeamMembership.player_id == player_id,
            PlayerTeamMembership.team_id == team_id,
        )
    ).one_or_none()
    if membership is None:
        raise NotFound(f"no membership for player {player_id} on team {team_id}")

    if is_borrowed_player is not _UNSET:
        membership.is_borrowed_player = is_borrowed_player
    if is_wildcard is not _UNSET:
        membership.is_wildcard = is_wildcard
    if representing_school is not _UNSET:
        membership.representing_school = representing_school

    # External players (borrowed OR wildcard) do not represent a home school.
    if membership.is_borrowed_player or membership.is_wildcard:
        membership.representing_school = None

    session.add(membership)
    session.commit()
    session.refresh(membership)
    return membership


def remove_membership(session: Session, player_id: int, membership_id: int) -> None:
    """Take a player off a team. The player and their season values stay.

    Leaving a team is not leaving the event: the participation UTR is a
    property of the person and the year, not of the shirt they wore.
    """
    membership = session.get(PlayerTeamMembership, membership_id)
    if membership is None or membership.player_id != player_id:
        raise NotFound(f"no membership {membership_id} for player {player_id}")

    team = session.get(Team, membership.team_id)
    if team is not None:
        _assert_season_open(session, team.season_year)

    session.delete(membership)
    session.commit()


def set_season_utr(
    session: Session,
    player_id: int,
    season_year: int,
    value: Decimal,
    source: str,
    status: Optional[str] = None,
    under_appeal: bool = False,
) -> PlayerSeasonUtr:
    """Write this season's participation UTR, replacing whatever was there.

    Writing a value settles it: any unresolved conflict on that season is over,
    because someone has now said what the number is. The alternate candidate is
    cleared with it — keeping it would leave the row claiming a disagreement
    that no longer exists.
    """
    _require_player(session, player_id)
    if session.get(Season, season_year) is None:
        raise NotFound(f"no season {season_year}")
    _assert_season_open(session, season_year)

    row = session.exec(
        select(PlayerSeasonUtr).where(
            PlayerSeasonUtr.player_id == player_id,
            PlayerSeasonUtr.season_year == season_year,
        )
    ).one_or_none()

    if row is None:
        row = PlayerSeasonUtr(player_id=player_id, season_year=season_year, value=value,
                              source=source, status=status, under_appeal=under_appeal)
    else:
        row.value = value
        row.source = source
        row.status = status
        row.under_appeal = under_appeal
        row.alt_value = None
        row.is_unresolved = False
        # Same invariant as a ruling: this is a new number, and the old
        # division no longer describes it.
        row.value_division = None
        row.alt_value_division = None

    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@dataclass
class MergeReport:
    """What a merge actually did.

    Returned rather than logged because merging is irreversible here — this
    change ships no undo and no history — so the caller needs enough to tell a
    human what just happened.
    """

    memberships_moved: int = 0
    season_utrs_moved: int = 0
    #: Seasons that now hold two candidate values and need a ruling.
    conflicts: list[int] = field(default_factory=list)


def _seasons_touched_by(session: Session, player_ids: list[int]) -> set[int]:
    years = {
        row.season_year
        for row in session.exec(
            select(PlayerSeasonUtr).where(
                PlayerSeasonUtr.player_id.in_(player_ids)
            )
        ).all()
    }
    for team in session.exec(
        select(Team)
        .join(PlayerTeamMembership, PlayerTeamMembership.team_id == Team.id)
        .where(PlayerTeamMembership.player_id.in_(player_ids))
    ).all():
        years.add(team.season_year)
    return years


def merge_players(session: Session, keep_id: int, merge_id: int) -> MergeReport:
    """Fold one player into another. The absorbed record is deleted.

    A season that ends up with two DIFFERENT values is marked unresolved and
    keeps both, larger in `value`. That does not block the merge: refusing
    would leave two records for one person, which is the very thing the merge
    exists to fix. Two identical values are not a conflict at all.
    """
    if keep_id == merge_id:
        raise Conflict("a player cannot be merged into themselves")

    keep = _require_player(session, keep_id)
    merge = _require_player(session, merge_id)

    # Only the seasons this merge actually changes — which is exactly the
    # seasons the absorbed record has rows in, since those are the rows that
    # move and the only ones that can create a conflict. The survivor's own
    # history is left untouched, so a frozen season they happen to have played
    # in is none of this merge's business: locking on the union of both
    # histories would refuse the very case this feature exists for, a duplicate
    # discovered after an old season was closed.
    for year in sorted(_seasons_touched_by(session, [merge.id])):
        _assert_season_open(session, year)

    report = MergeReport()

    kept_teams = {
        row.team_id
        for row in session.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == keep.id
            )
        ).all()
    }
    for membership in session.exec(
        select(PlayerTeamMembership).where(
            PlayerTeamMembership.player_id == merge.id
        )
    ).all():
        if membership.team_id in kept_teams:
            # Both records were already on this team; one row is the answer.
            session.delete(membership)
            continue
        membership.player_id = keep.id
        session.add(membership)
        report.memberships_moved += 1

    kept_utrs = {
        row.season_year: row
        for row in session.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == keep.id)
        ).all()
    }
    for incoming in session.exec(
        select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == merge.id)
    ).all():
        existing = kept_utrs.get(incoming.season_year)
        if existing is None:
            incoming.player_id = keep.id
            session.add(incoming)
            report.season_utrs_moved += 1
            continue

        if existing.value == incoming.value:
            session.delete(incoming)
            continue

        # Two different numbers for one season: keep both. The larger goes in
        # `value` because participation UTR is read as an upper bound —
        # reading low would call an illegal lineup legal, and that only
        # surfaces on match day.
        year = incoming.season_year
        pairs = sorted(
            [
                (existing.value, existing.value_division),
                (incoming.value, incoming.value_division),
            ],
            key=lambda pair: pair[0],
            reverse=True,
        )
        (high, high_division), (low, low_division) = pairs

        existing.value = high
        existing.alt_value = low
        existing.is_unresolved = True
        # Provenance follows the value it describes. Leaving the survivor's old
        # division in place would label the incoming number with the wrong
        # sheet — and a wrong label is worse than none, because whoever rules on
        # the conflict cannot tell it from a correct one.
        #
        # If either side never recorded a division, both are dropped: a half
        # known provenance still prints one column and invites the reader to
        # assume the other.
        if high_division is None or low_division is None:
            existing.value_division = None
            existing.alt_value_division = None
        else:
            existing.value_division = high_division
            existing.alt_value_division = low_division
        session.add(existing)
        session.delete(incoming)
        report.conflicts.append(year)

    # Flush the child rows first. The foreign keys cascade on delete, so
    # removing the absorbed player and its rows in one flush has the database
    # delete rows SQLAlchemy is still holding — harmless, but it warns, and a
    # suite that prints warnings trains people to ignore them.
    session.flush()
    session.delete(merge)
    session.commit()
    report.conflicts.sort()
    return report


def split_player(
    session: Session,
    player_id: int,
    last_name: str,
    first_name: str,
    membership_ids: list[int],
    season_years: list[int],
    gender: Optional[str] = None,
    utr_profile_id: Optional[str] = None,
) -> Player:
    """Split one record into two, moving exactly the rows named.

    Row by row rather than by a rule: the reason a split is needed at all is
    that the name-based guess put two humans together, and no rule can tell
    which rows belong to which of them. Anything not named stays put.
    """
    original = _require_player(session, player_id)

    memberships = []
    for membership_id in membership_ids:
        membership = session.get(PlayerTeamMembership, membership_id)
        if membership is None or membership.player_id != player_id:
            raise NotFound(
                f"membership {membership_id} does not belong to player {player_id}"
            )
        memberships.append(membership)

    utrs = []
    for year in season_years:
        row = session.exec(
            select(PlayerSeasonUtr).where(
                PlayerSeasonUtr.player_id == player_id,
                PlayerSeasonUtr.season_year == year,
            )
        ).one_or_none()
        if row is None:
            raise NotFound(f"player {player_id} has no season UTR for {year}")
        utrs.append(row)

    for membership in memberships:
        team = session.get(Team, membership.team_id)
        if team is not None:
            _assert_season_open(session, team.season_year)
    for row in utrs:
        _assert_season_open(session, row.season_year)

    new_player = Player(
        last_name=last_name,
        first_name=first_name,
        gender=gender if gender is not None else original.gender,
        utr_profile_id=utr_profile_id,
    )
    session.add(new_player)
    session.flush()

    for membership in memberships:
        membership.player_id = new_player.id
        session.add(membership)
    for row in utrs:
        row.player_id = new_player.id
        session.add(row)

    session.commit()
    session.refresh(new_player)
    return new_player


def rule_on_season_utr(
    session: Session,
    player_id: int,
    season_year: int,
    value: Decimal,
    status: Optional[str] = None,
) -> PlayerSeasonUtr:
    """Settle a contested season.

    The value may be neither candidate: the committee can issue a correction
    after both sheets were frozen, and forcing a choice between two wrong
    numbers would only launder the error. Provenance becomes `admin_ruling`,
    because after this the number is not what either sheet said — it is what a
    human decided.
    """
    _require_player(session, player_id)
    _assert_season_open(session, season_year)

    row = session.exec(
        select(PlayerSeasonUtr).where(
            PlayerSeasonUtr.player_id == player_id,
            PlayerSeasonUtr.season_year == season_year,
        )
    ).one_or_none()
    if row is None:
        raise NotFound(f"player {player_id} has no season UTR for {season_year}")
    if not row.is_unresolved:
        raise Conflict(
            f"season {season_year} is not contested; edit it instead of ruling on it"
        )

    row.value = value
    row.alt_value = None
    row.is_unresolved = False
    row.source = "admin_ruling"
    # The ruled value may be neither candidate, so no sheet stands behind it.
    # Provenance describes the current value or it describes nothing.
    row.value_division = None
    row.alt_value_division = None
    if status is not None:
        row.status = status
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
