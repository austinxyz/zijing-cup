"""Assemble team and roster responses.

Read-only. Rosters change once a season through a reviewed CSV and the CLI;
there is no per-user login here, so a write endpoint would let anyone
overwrite every team's roster.

Three fields carry an "unknown" that must survive to the client rather than
being defaulted away: the rating class of an Unrated player, the
borrowed-player flag, and the UTR profile link. Each is null when nobody has
decided yet, which is a different claim from any concrete value.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.models import (
    Division,
    DivisionBorrowedLimit,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    SeasonLock,
    Team,
)
from app.players.utr_chain import SeasonUtrView, UtrOrigin, resolve_match_utr


class TeamSummaryOut(BaseModel):
    code: str

    #: null when nobody has named this team. Not the code echoed back — the
    #: client decides how to present an unnamed team, and a name invented
    #: here would be indistinguishable from one a human chose.
    display_name: Optional[str] = None

    #: Lets a captain spot an under-strength or suspiciously small team from
    #: the list without opening each one.
    player_count: int

    #: Fielding a lineup needs one woman for mixed doubles and two for
    #: women's doubles — at least three on court. Which teams are close to
    #: that floor is the thing a captain reads off this list.
    men_count: int = 0
    women_count: int = 0

    #: Its own bucket, never folded into either side: `gender` is nullable,
    #: and adding an unknown to 男 or 女 would invent a player on that side.
    unknown_gender_count: int = 0


class TeamOut(BaseModel):
    #: The team's own id. The edit UI needs it to address a membership write by
    #: (player, team); the code alone is not the key the membership table uses.
    id: int
    code: str
    display_name: Optional[str] = None
    season_year: int
    division_code: str


class RosterPlayerOut(BaseModel):
    #: The player's own id. Everything downstream that has to refer to this
    #: person by anything other than a name uses it: the lineup keys, the
    #: roster page's inline edit, and the current-UTR sheet, which orders its
    #: rows by identity precisely so it never has to match on names.
    player_id: int

    last_name: str
    first_name: str
    gender: Optional[str] = None

    #: The participation UTR the event actually uses. Frozen when the season
    #: has one; otherwise derived — see `origin`. Null together with `origin`
    #: when the chain finds nothing at all: the player is on the team, so he
    #: is on the roster, and there is no number to show. Never 0 or a
    #: sentinel — 0 is a legal UTR and a reader could not tell them apart.
    match_utr: Optional[Decimal] = None

    #: Where `match_utr` came from, and from which season. A derived value has
    #: to be presentable as derived: it is not what the committee froze.
    origin: Optional[UtrOrigin] = None
    origin_year: Optional[int] = None

    #: The season value has two candidates and nobody has ruled between them.
    is_unresolved: bool = False

    #: Rides on top of `rating_class` rather than replacing it: any of the
    #: three classes can be under appeal.
    under_appeal: bool = False

    #: Always null. The registry does not store the sheet's own status word,
    #: and the field is kept only so the response shape is unchanged — reading
    #: a fact out of it would be reading "not stored" as "the sheet said
    #: nothing".
    dutr_status: Optional[str] = None

    #: null when the status does not determine it (Unrated). Not a default —
    #: the class gates the "at most 2 self-rated on court" rule, so an
    #: invented value would be worse than an absent one.
    rating_class: Optional[str] = None

    #: Always null, for the same reason as `dutr_status`.
    source_note: Optional[str] = None

    #: Always empty, for the same reason as `dutr_status`.
    daily_utrs: list[Decimal] = []

    #: The player's live UTRs, each with the word UTR itself uses for it.
    #: These are the input to step two of the derivation chain, so a reader
    #: who wants to know why an estimate landed where it did — or to work one
    #: out before the season's value exists — needs them on the same row.
    #: Null when nobody has filled them in, which today is everybody.
    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None

    #: null means nobody has marked this player — NOT "confirmed not a
    #: borrowed player". The rules cap borrowed players per team and per
    #: match, so the distinction decides whether a lineup was really checked.
    is_borrowed_player: Optional[bool] = None

    #: Not the same as borrowed: from a non-current school, needs committee
    #: approval, does NOT affect eligibility. Shown/edited on the team page.
    is_wildcard: Optional[bool] = None

    #: The home school this player represents (null for borrowed/wildcard, who
    #: have none). Editable on the team page for regular players.
    representing_school: Optional[str] = None

    utr_profile_id: Optional[str] = None

    #: Career win/loss, imported from the committee's current-UTR sheet. Both
    #: null means no record has ever been imported — NOT 0-0 (a real 0 wins is
    #: a legal, different claim). Win rate is derived on display, never here.
    wins: Optional[int] = None
    losses: Optional[int] = None


class TeamRosterOut(BaseModel):
    team: TeamOut
    players: list[RosterPlayerOut]
    #: Whether the season is frozen (a `season_locks` row exists for the year).
    #: Read-only, for the edit UI: while unlocked, writing a current doubles UTR
    #: also overwrites the participation UTR, and the editor says so; once
    #: locked, the backend refuses that write, so the warning must not show.
    locked: bool
    #: How many schools this (联队) team combines, or null if unset. Drives the
    #: per-match borrowed ceiling; the edit UI shows the caps derived from it.
    school_count: Optional[int] = None
    #: This division's borrowed-limit rule as school_count -> {roster_cap,
    #: on_court_cap}, so the edit UI can show the caps for whatever school_count
    #: the admin picks and warn when the roster exceeds roster_cap. Empty when
    #: the division has no borrowed rule seeded.
    borrowed_limits: dict[int, dict[str, int]] = {}


def _division_exists(session: Session, year: int, code: str) -> bool:
    return (
        session.exec(
            select(Division).where(
                Division.season_year == year, Division.code == code
            )
        ).one_or_none()
        is not None
    )


def list_teams(
    session: Session, year: int, division_code: str
) -> Optional[list[TeamSummaryOut]]:
    """Teams in a division, or None when that division does not exist.

    None and "an empty list" are different answers: the first means the URL
    names nothing, the second that the division has no teams yet.
    """
    if not _division_exists(session, year, division_code):
        return None

    # One grouped query with gender as a second dimension, not a count per
    # team: a division has up to two dozen teams, and a query each would be
    # two dozen round trips for a number that is already one GROUP BY away.
    #
    # Counted off the memberships, not the CSV snapshot: a player added
    # through the admin UI has a membership and no snapshot row, and the
    # number a captain reads here has to be the current squad.
    rows = session.exec(
        select(
            Team.code,
            Team.display_name,
            Player.gender,
            func.count(PlayerTeamMembership.id),
        )
        .join(
            PlayerTeamMembership,
            PlayerTeamMembership.team_id == Team.id,
            isouter=True,
        )
        .join(Player, Player.id == PlayerTeamMembership.player_id, isouter=True)
        .where(Team.season_year == year, Team.division_code == division_code)
        .group_by(Team.code, Team.display_name, Player.gender)
        .order_by(Team.code)
    ).all()

    summaries: dict[str, TeamSummaryOut] = {}
    for code, name, gender, count in rows:
        summary = summaries.get(code)
        if summary is None:
            summary = TeamSummaryOut(code=code, display_name=name, player_count=0)
            summaries[code] = summary
        # A team with no roster comes back from the outer join as one row
        # with a null gender and a count of zero, so it needs no special
        # case: adding zero leaves every bucket at zero.
        summary.player_count += count
        if gender == "M":
            summary.men_count += count
        elif gender == "F":
            summary.women_count += count
        else:
            summary.unknown_gender_count += count

    return list(summaries.values())


def get_team_roster(
    session: Session, year: int, division_code: str, team_code: str
) -> Optional[TeamRosterOut]:
    """One team's roster, or None when the season, division or team is unknown."""
    team = session.exec(
        select(Team).where(
            Team.season_year == year,
            Team.division_code == division_code,
            Team.code == team_code,
        )
    ).one_or_none()
    if team is None:
        return None

    memberships = session.exec(
        select(PlayerTeamMembership, Player)
        .join(Player, Player.id == PlayerTeamMembership.player_id)
        .where(PlayerTeamMembership.team_id == team.id)
    ).all()

    player_ids = [player.id for _, player in memberships]
    seasons_by_player: dict[int, list[SeasonUtrView]] = {}
    appeal_by_player: dict[int, bool] = {}
    status_by_player: dict[int, Optional[str]] = {}
    if player_ids:
        # One query for the whole team rather than one per player: a roster
        # runs to two dozen people and the chain needs every season anyway.
        for row in session.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id.in_(player_ids))
        ).all():
            seasons_by_player.setdefault(row.player_id, []).append(
                SeasonUtrView(
                    season_year=row.season_year,
                    value=row.value,
                    is_unresolved=row.is_unresolved,
                )
            )
            if row.season_year == year:
                appeal_by_player[row.player_id] = row.under_appeal
                status_by_player[row.player_id] = row.status

    players: list[RosterPlayerOut] = []
    for membership, player in memberships:
        resolved = resolve_match_utr(
            season_utrs=seasons_by_player.get(player.id, []),
            current_doubles=player.doubles_utr,
            current_doubles_status=player.doubles_status,
            season_year=year,
        )
        # A player the chain finds nothing for still belongs here: he is on
        # the team, and dropping him would leave the team list and the roster
        # disagreeing with nothing on screen to say who went missing.
        players.append(
            RosterPlayerOut(
                player_id=player.id,
                last_name=player.last_name,
                first_name=player.first_name,
                gender=player.gender,
                match_utr=resolved.value if resolved else None,
                origin=resolved.origin if resolved else None,
                origin_year=resolved.origin_year if resolved else None,
                is_unresolved=resolved.is_unresolved if resolved else False,
                rating_class=status_by_player.get(player.id),
                under_appeal=appeal_by_player.get(player.id, False),
                singles_utr=player.singles_utr,
                singles_status=player.singles_status,
                doubles_utr=player.doubles_utr,
                doubles_status=player.doubles_status,
                is_borrowed_player=membership.is_borrowed_player,
                is_wildcard=membership.is_wildcard,
                representing_school=membership.representing_school,
                utr_profile_id=player.utr_profile_id,
                wins=player.wins,
                losses=player.losses,
            )
        )

    # Strongest first: that is the order a captain reads a roster in when
    # working out who can fill the top lines. Sorted on the resolved value,
    # so a derived number sits where its size puts it. Players with no value
    # sort last rather than first — an unknown is not a strength.
    players.sort(
        key=lambda p: (p.match_utr is None, -(p.match_utr or 0), p.last_name)
    )

    return TeamRosterOut(
        team=TeamOut(
            id=team.id,
            code=team.code,
            display_name=team.display_name,
            season_year=team.season_year,
            division_code=team.division_code,
        ),
        players=players,
        locked=session.get(SeasonLock, year) is not None,
        school_count=team.school_count,
        borrowed_limits=_borrowed_limits_for(session, year, division_code),
    )


def _borrowed_limits_for(
    session: Session, year: int, division_code: str
) -> dict[int, dict[str, int]]:
    division = session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == division_code
        )
    ).one_or_none()
    if division is None:
        return {}
    rows = session.exec(
        select(DivisionBorrowedLimit).where(
            DivisionBorrowedLimit.division_id == division.id
        )
    ).all()
    return {
        r.school_count: {"roster_cap": r.roster_cap, "on_court_cap": r.on_court_cap}
        for r in rows
    }
