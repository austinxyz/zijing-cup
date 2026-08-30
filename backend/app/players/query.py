"""Reading players, and the shapes the API hands back.

Read-side only. Anything that writes lives in `command.py`, and the rules that
decide identity live in `merge_rules.py` — the split is the same one
`app/lineups/` uses, and for the same reason: the interesting logic should be
testable without a database.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import Player, PlayerSeasonUtr, PlayerTeamMembership, Team


class MembershipOut(BaseModel):
    id: int
    team_id: int
    team_code: str
    season_year: int
    division_code: str

    #: Free text. There is no school table to resolve this against, on purpose.
    representing_school: Optional[str] = None

    #: null means nobody has marked this player, which is NOT the same claim as
    #: "confirmed not one". The borrowed-player rule caps how many may play,
    #: and this system never checks it — so the distinction decides whether a
    #: lineup was really vetted or only looked at.
    is_borrowed_player: Optional[bool] = None

    #: A different thing from borrowed: not from the current school, needs
    #: committee approval, does not affect eligibility.
    is_wildcard: Optional[bool] = None


class SeasonUtrOut(BaseModel):
    season_year: int

    #: What gets read. While a conflict is unresolved this is the larger of the
    #: two candidates — participation UTR is an upper bound, so reading low
    #: would call an illegal lineup legal.
    value: Decimal

    #: The other candidate, kept rather than dropped. null when there is none.
    alt_value: Optional[Decimal] = None
    is_unresolved: bool = False

    #: Which sheet each candidate came from, where that is known. Null for a
    #: conflict created by merging two hand-made records — nothing behind those
    #: numbers is a division. Never inferred from size: the larger candidate is
    #: gold for some players and silver for others.
    value_division: Optional[str] = None
    alt_value_division: Optional[str] = None

    #: null means nobody has decided — an Unrated sheet row could be committee
    #: adjudicated or captain rated depending on match history the sheet does
    #: not carry.
    status: Optional[str] = None
    under_appeal: bool = False

    #: 'prefilled' is a guess copied from the current UTR; without this the
    #: guess and a frozen official value look identical.
    source: str


class PlayerOut(BaseModel):
    id: int
    last_name: str
    first_name: str
    gender: Optional[str] = None

    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None

    #: The only evidence two records are the same human. Empty asserts nothing.
    utr_profile_id: Optional[str] = None

    season_utrs: list[SeasonUtrOut] = []
    memberships: list[MembershipOut] = []


def _memberships_for(session: Session, player_ids: list[int]) -> dict[int, list[MembershipOut]]:
    if not player_ids:
        return {}
    rows = session.exec(
        select(PlayerTeamMembership, Team)
        .join(Team, Team.id == PlayerTeamMembership.team_id)
        .where(PlayerTeamMembership.player_id.in_(player_ids))
        .order_by(Team.season_year, Team.division_code, Team.code)
    ).all()

    out: dict[int, list[MembershipOut]] = {}
    for membership, team in rows:
        out.setdefault(membership.player_id, []).append(
            MembershipOut(
                id=membership.id,
                team_id=team.id,
                team_code=team.code,
                season_year=team.season_year,
                division_code=team.division_code,
                representing_school=membership.representing_school,
                is_borrowed_player=membership.is_borrowed_player,
                is_wildcard=membership.is_wildcard,
            )
        )
    return out


def _season_utrs_for(session: Session, player_ids: list[int]) -> dict[int, list[SeasonUtrOut]]:
    if not player_ids:
        return {}
    rows = session.exec(
        select(PlayerSeasonUtr)
        .where(PlayerSeasonUtr.player_id.in_(player_ids))
        .order_by(PlayerSeasonUtr.season_year.desc())
    ).all()

    out: dict[int, list[SeasonUtrOut]] = {}
    for row in rows:
        out.setdefault(row.player_id, []).append(
            SeasonUtrOut(
                season_year=row.season_year,
                value=row.value,
                alt_value=row.alt_value,
                is_unresolved=row.is_unresolved,
                value_division=row.value_division,
                alt_value_division=row.alt_value_division,
                status=row.status,
                under_appeal=row.under_appeal,
                source=row.source,
            )
        )
    return out


def _assemble(
    players: list[Player],
    memberships: dict[int, list[MembershipOut]],
    season_utrs: dict[int, list[SeasonUtrOut]],
) -> list[PlayerOut]:
    return [
        PlayerOut(
            id=p.id,
            last_name=p.last_name,
            first_name=p.first_name,
            gender=p.gender,
            singles_utr=p.singles_utr,
            singles_status=p.singles_status,
            doubles_utr=p.doubles_utr,
            doubles_status=p.doubles_status,
            utr_profile_id=p.utr_profile_id,
            season_utrs=season_utrs.get(p.id, []),
            memberships=memberships.get(p.id, []),
        )
        for p in players
    ]


def get_player(session: Session, player_id: int) -> Optional[PlayerOut]:
    """One player, or None when there is no such id."""
    player = session.get(Player, player_id)
    if player is None:
        return None
    ids = [player.id]
    return _assemble(
        [player], _memberships_for(session, ids), _season_utrs_for(session, ids)
    )[0]


def count_players(
    session: Session,
    query: Optional[str] = None,
    season_year: Optional[int] = None,
    team_id: Optional[int] = None,
    unresolved_only: bool = False,
) -> int:
    """How many players match, ignoring the page limit.

    Separate from the list because a caller showing 200 of 375 needs the real
    total; a badge that counts only what one page happened to contain is a
    wrong number presented as a fact.
    """
    ids = session.exec(
        _filtered(select(Player.id), query, season_year, team_id, unresolved_only)
    ).all()
    return len(set(ids))


def _filtered(
    statement,
    query: Optional[str],
    season_year: Optional[int],
    team_id: Optional[int],
    unresolved_only: bool,
):
    if query:
        needle = f"%{query.strip().lower()}%"
        statement = statement.where(
            (Player.last_name.ilike(needle))
            | (Player.first_name.ilike(needle))
            | (Player.utr_profile_id.ilike(needle))
        )

    if season_year is not None or team_id is not None:
        statement = statement.join(
            PlayerTeamMembership, PlayerTeamMembership.player_id == Player.id
        ).join(Team, Team.id == PlayerTeamMembership.team_id)
        if season_year is not None:
            statement = statement.where(Team.season_year == season_year)
        if team_id is not None:
            statement = statement.where(Team.id == team_id)

    if unresolved_only:
        statement = statement.where(
            Player.id.in_(
                select(PlayerSeasonUtr.player_id).where(
                    PlayerSeasonUtr.is_unresolved.is_(True)
                )
            )
        )

    return statement


def list_players(
    session: Session,
    query: Optional[str] = None,
    season_year: Optional[int] = None,
    team_id: Optional[int] = None,
    unresolved_only: bool = False,
    limit: int = 200,
) -> list[PlayerOut]:
    """Players, newest constraint first, with their teams and season values.

    Three queries rather than one per player: a roster of a few hundred with a
    membership lookup each would be a few hundred round trips for something a
    single IN clause answers.
    """
    statement = _filtered(
        select(Player), query, season_year, team_id, unresolved_only
    )

    players = session.exec(
        statement.order_by(Player.last_name, Player.first_name, Player.id).limit(limit)
    ).all()
    # A player on two teams in one season matches the join twice.
    unique: dict[int, Player] = {p.id: p for p in players}
    ordered = list(unique.values())

    ids = [p.id for p in ordered]
    return _assemble(
        ordered, _memberships_for(session, ids), _season_utrs_for(session, ids)
    )
