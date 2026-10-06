"""Match records: read (behind the backend secret) + protected writes.

GET (list/detail) are reads; POST/DELETE are writes, guarded by the method-keyed
admin middleware without declaring anything here — the same subtractive guarantee
the rest of the app relies on.

The whole-tie outcome is derived (per division scoring_mode) on read, never stored.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.db import get_session
from app.matches.service import (
    InvalidMatch,
    collect_player_ids,
    compute_outcome,
    create_match,
    line_codes,
    resolve_players,
)
from app.models import Division, DivisionLine, MatchRecord, Player, Team

router = APIRouter(prefix="/api", tags=["matches"])

_BASE = "/seasons/{year}/divisions/{code}/matches"

MAX_NOTE = 500

#: Our-side keys are roster keys ("p{id}", same as saved_lineups.assignment).
_KEY_RE = re.compile(r"^p\d+$")


class LineIn(BaseModel):
    our: list[str]
    opp: list[Optional[int]]
    outcome: str
    note: str = ""

    @field_validator("our")
    @classmethod
    def _two_keys(cls, v: list[str]) -> list[str]:
        if len(v) != 2:
            raise ValueError("a line needs exactly two our-side player keys")
        if any(not _KEY_RE.match(k) for k in v):
            raise ValueError("our-side keys must look like 'p<id>'")
        if v[0] == v[1]:
            raise ValueError("the same player cannot fill both our-side slots")
        return v

    @field_validator("opp")
    @classmethod
    def _two_opp_slots(cls, v: list[Optional[int]]) -> list[Optional[int]]:
        # A doubles line has exactly two opponent slots; each is a player id or
        # null (null = unmatched / not recorded, never zero).
        if len(v) != 2:
            raise ValueError("a line needs exactly two opponent slots (id or null)")
        return v

    @field_validator("outcome")
    @classmethod
    def _outcome(cls, v: str) -> str:
        if v not in ("win", "loss"):
            raise ValueError("outcome must be 'win' or 'loss'")
        return v

    @field_validator("note")
    @classmethod
    def _note(cls, v: str) -> str:
        if len(v) > MAX_NOTE:
            raise ValueError(f"note over {MAX_NOTE} characters")
        return v


class MatchIn(BaseModel):
    our_team_code: str
    opponent_team_code: str
    match_date: date
    round_label: Optional[str] = None
    source_lineup_id: Optional[int] = None
    lines: dict[str, LineIn]


class MatchOut(BaseModel):
    id: int
    our_team_code: str
    opponent_team_code: str
    match_date: date
    round_label: Optional[str] = None
    source_lineup_id: Optional[int] = None
    lines: dict[str, Any]
    outcome: dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def _require_division(session: Session, year: int, code: str) -> Division:
    division = session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == code
        )
    ).one_or_none()
    if division is None:
        raise HTTPException(status_code=404, detail="division not found")
    return division


def _line_points(session: Session, division_id: int) -> dict[str, int]:
    return {
        row.code: row.points
        for row in session.exec(
            select(DivisionLine).where(DivisionLine.division_id == division_id)
        ).all()
    }


def _team_codes(session: Session, year: int, code: str) -> dict[int, str]:
    return {
        t.id: t.code
        for t in session.exec(
            select(Team).where(
                Team.season_year == year, Team.division_code == code
            )
        ).all()
    }


def _player_brief(player: Optional[Player]) -> Optional[dict[str, Any]]:
    """Resolved player for display, or None when the id matched no player
    (rendered as "未记录", never a zero or a fabricated name)."""
    if player is None:
        return None
    return {
        "player_id": player.id,
        "last_name": player.last_name,
        "first_name": player.first_name,
        "gender": player.gender,
    }


def _enrich_lines(lines: dict[str, Any], players: dict[int, Player]) -> dict[str, Any]:
    """Add resolved our_players / opp_players to each line, keyed off the stored
    our keys (p{id}) and opp ids. Unresolved refs resolve to null."""
    out: dict[str, Any] = {}
    for line_code, line in lines.items():
        our_players = []
        for key in line.get("our", []):
            pid = None
            if isinstance(key, str) and key.startswith("p"):
                try:
                    pid = int(key[1:])
                except ValueError:
                    pid = None
            brief = _player_brief(players.get(pid)) if pid is not None else None
            if brief is not None:
                brief = {"key": key, **brief}
            our_players.append(brief)
        opp_players = [
            _player_brief(players.get(pid)) if isinstance(pid, int) else None
            for pid in line.get("opp", [])
        ]
        out[line_code] = {**line, "our_players": our_players, "opp_players": opp_players}
    return out


def _out(row: MatchRecord, codes: dict[int, str], division: Division,
         line_points: dict[str, int], players: dict[int, Player]) -> MatchOut:
    return MatchOut(
        id=row.id,
        our_team_code=codes.get(row.our_team_id, ""),
        opponent_team_code=codes.get(row.opponent_team_id, ""),
        match_date=row.match_date,
        round_label=row.round_label,
        source_lineup_id=row.source_lineup_id,
        lines=_enrich_lines(row.lines, players),
        outcome=compute_outcome(row.lines, line_points, division.scoring_mode),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(_BASE, response_model=list[MatchOut])
def list_matches(
    year: int, code: str, team: Optional[str] = None, opponent: Optional[str] = None,
    session: Session = Depends(get_session),
) -> list[MatchOut]:
    division = _require_division(session, year, code)
    codes = _team_codes(session, year, code)
    line_points = _line_points(session, division.id)
    stmt = select(MatchRecord).where(
        MatchRecord.season_year == year, MatchRecord.division_code == code
    ).order_by(MatchRecord.match_date.desc(), MatchRecord.id.desc())
    rows = list(session.exec(stmt).all())
    code_to_id = {v: k for k, v in codes.items()}
    if team is not None:
        tid = code_to_id.get(team)
        rows = [r for r in rows if r.our_team_id == tid or r.opponent_team_id == tid]
    if opponent is not None:
        oid = code_to_id.get(opponent)
        rows = [r for r in rows if r.opponent_team_id == oid]
    all_ids: set[int] = set()
    for r in rows:
        all_ids |= collect_player_ids(r.lines)
    players = resolve_players(session, all_ids)
    return [_out(r, codes, division, line_points, players) for r in rows]


@router.get(_BASE + "/{match_id}", response_model=MatchOut)
def get_match(
    year: int, code: str, match_id: int, session: Session = Depends(get_session),
) -> MatchOut:
    division = _require_division(session, year, code)
    codes = _team_codes(session, year, code)
    line_points = _line_points(session, division.id)
    row = session.exec(
        select(MatchRecord).where(
            MatchRecord.id == match_id,
            MatchRecord.season_year == year,
            MatchRecord.division_code == code,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="match not found")
    players = resolve_players(session, collect_player_ids(row.lines))
    return _out(row, codes, division, line_points, players)


@router.post(_BASE, response_model=MatchOut, status_code=201)
def create_division_match(
    year: int, code: str, body: MatchIn, session: Session = Depends(get_session),
) -> MatchOut:
    division = _require_division(session, year, code)
    allowed = line_codes(session, division.id)
    lines = {lc: li.model_dump() for lc, li in body.lines.items()}
    try:
        row = create_match(
            session, year, code, body.our_team_code, body.opponent_team_code,
            body.match_date, body.round_label, body.source_lineup_id,
            lines, allowed,
        )
    except InvalidMatch as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    codes = _team_codes(session, year, code)
    line_points = _line_points(session, division.id)
    players = resolve_players(session, collect_player_ids(row.lines))
    return _out(row, codes, division, line_points, players)


@router.delete(_BASE + "/{match_id}", status_code=204)
def delete_division_match(
    year: int, code: str, match_id: int, session: Session = Depends(get_session),
) -> Response:
    _require_division(session, year, code)
    row = session.exec(
        select(MatchRecord).where(
            MatchRecord.id == match_id,
            MatchRecord.season_year == year,
            MatchRecord.division_code == code,
        )
    ).one_or_none()
    if row is not None:
        session.delete(row)
        session.commit()
    return Response(status_code=204)
