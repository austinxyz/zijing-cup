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

from app.models import Division, RosterEntry, Team


class TeamSummaryOut(BaseModel):
    code: str

    #: Lets a captain spot an under-strength or suspiciously small team from
    #: the list without opening each one.
    player_count: int


class TeamOut(BaseModel):
    code: str
    season_year: int
    division_code: str


class RosterPlayerOut(BaseModel):
    last_name: str
    first_name: str
    gender: Optional[str] = None

    #: The frozen participation UTR the event actually uses.
    match_utr: Decimal

    #: The committee sheet's own status word, including any "/ Appeal" suffix.
    dutr_status: str

    #: null when the status does not determine it (Unrated). Not a default —
    #: the class gates the "at most 2 self-rated on court" rule, so an
    #: invented value would be worse than an absent one.
    rating_class: Optional[str] = None

    #: Where the participation UTR came from. Evidence for classifying the
    #: player and for raising a UTR grievance.
    source_note: Optional[str] = None

    daily_utrs: list[Decimal] = []

    #: null means nobody has marked this player — NOT "confirmed not a
    #: borrowed player". The rules cap borrowed players per team and per
    #: match, so the distinction decides whether a lineup was really checked.
    is_borrowed_player: Optional[bool] = None

    utr_profile_id: Optional[str] = None


class TeamRosterOut(BaseModel):
    team: TeamOut
    players: list[RosterPlayerOut]


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

    # One grouped query rather than a count per team.
    rows = session.exec(
        select(Team.code, func.count(RosterEntry.id))
        .join(RosterEntry, RosterEntry.team_id == Team.id, isouter=True)
        .where(Team.season_year == year, Team.division_code == division_code)
        .group_by(Team.code)
        .order_by(Team.code)
    ).all()

    return [TeamSummaryOut(code=code, player_count=count) for code, count in rows]


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

    entries = session.exec(
        select(RosterEntry)
        .where(RosterEntry.team_id == team.id)
        # Strongest first: that is the order a captain reads a roster in when
        # working out who can fill the top lines.
        .order_by(RosterEntry.match_utr.desc(), RosterEntry.last_name)
    ).all()

    return TeamRosterOut(
        team=TeamOut(
            code=team.code,
            season_year=team.season_year,
            division_code=team.division_code,
        ),
        players=[
            RosterPlayerOut(
                last_name=entry.last_name,
                first_name=entry.first_name,
                gender=entry.gender,
                match_utr=entry.match_utr,
                dutr_status=entry.dutr_status,
                rating_class=entry.rating_class,
                source_note=entry.source_note,
                daily_utrs=list(entry.daily_utrs or []),
                is_borrowed_player=entry.is_borrowed_player,
                utr_profile_id=entry.utr_profile_id,
            )
            for entry in entries
        ],
    )
