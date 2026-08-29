"""Writing players, memberships and season UTRs.

Everything that changes data goes through here, so the rules that guard a
write — the season lock especially — are stated once instead of being repeated
at each call site and eventually forgotten at one of them.

Callers get exceptions rather than HTTP status codes: the routes translate.
That keeps this module usable from the migration command and the tests without
a request in sight.
"""

from __future__ import annotations

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


def _require_player(session: Session, player_id: int) -> Player:
    player = session.get(Player, player_id)
    if player is None:
        raise NotFound(f"no player {player_id}")
    return player


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

    session.add(row)
    session.commit()
    session.refresh(row)
    return row
