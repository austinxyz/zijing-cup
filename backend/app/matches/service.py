"""Create, list, get, and delete match records; derive the whole-tie outcome.

A match record is a played tie for one (season, division): our team vs an
opponent team in the SAME division, per-line on-court players for both sides, and
each line's win/loss + note. These functions own the database side; the route
layer is thin. Writes are reached only through routes the admin middleware guards
by HTTP method.

The whole-tie outcome is DERIVED here (per division scoring_mode), never stored.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlmodel import Session, select

from app.models import DivisionLine, MatchRecord, Player, Team

MAX_ROUND_LABEL = 60

#: Our-side keys are roster keys ("p{id}"); strip the prefix to the player id.
_KEY_PREFIX = "p"


def _key_to_id(key: str) -> Optional[int]:
    if not key.startswith(_KEY_PREFIX):
        return None
    try:
        return int(key[len(_KEY_PREFIX):])
    except ValueError:
        return None


def collect_player_ids(lines: dict[str, Any]) -> set[int]:
    """Every player id referenced across a record's lines — our keys (p{id}) and
    non-null opponent ids — so they can be resolved in one query."""
    ids: set[int] = set()
    for line in lines.values():
        for key in line.get("our", []):
            pid = _key_to_id(key) if isinstance(key, str) else None
            if pid is not None:
                ids.add(pid)
        for pid in line.get("opp", []):
            if isinstance(pid, int):
                ids.add(pid)
    return ids


def resolve_players(session: Session, ids: set[int]) -> dict[int, Player]:
    """Batch-load the referenced players, keyed by id (avoids N+1). Ids with no
    matching player are simply absent — the read layer renders those as null
    ("未记录"), never a zero or a fabricated name."""
    if not ids:
        return {}
    rows = session.exec(select(Player).where(Player.id.in_(ids))).all()
    return {p.id: p for p in rows}


class InvalidMatch(ValueError):
    """A create rejected before touching the row: bad team, self-match, or an
    unknown line code."""


def _team_by_code(
    session: Session, year: int, code: str, team_code: str
) -> Optional[Team]:
    return session.exec(
        select(Team).where(
            Team.season_year == year,
            Team.division_code == code,
            Team.code == team_code,
        )
    ).one_or_none()


def line_codes(session: Session, division_id: int) -> set[str]:
    return {
        row.code
        for row in session.exec(
            select(DivisionLine).where(DivisionLine.division_id == division_id)
        ).all()
    }


def create_match(
    session: Session,
    year: int,
    code: str,
    our_team_code: str,
    opponent_team_code: str,
    match_date: date,
    round_label: Optional[str],
    source_lineup_id: Optional[int],
    lines: dict[str, Any],
    allowed_lines: set[str],
) -> MatchRecord:
    """Store a played tie. Both teams must be in this (season, division) and
    differ; every line code must be one of the division's lines."""
    if round_label is not None and len(round_label) > MAX_ROUND_LABEL:
        raise InvalidMatch(f"round label over {MAX_ROUND_LABEL} characters")

    our = _team_by_code(session, year, code, our_team_code)
    if our is None:
        raise InvalidMatch(f"unknown team in this division: {our_team_code}")
    opponent = _team_by_code(session, year, code, opponent_team_code)
    if opponent is None:
        raise InvalidMatch(f"unknown team in this division: {opponent_team_code}")
    if our.id == opponent.id:
        raise InvalidMatch("a team cannot play itself")

    unknown = set(lines) - allowed_lines
    if unknown:
        raise InvalidMatch(f"unknown line(s): {', '.join(sorted(unknown))}")

    row = MatchRecord(
        season_year=year,
        division_code=code,
        our_team_id=our.id,
        opponent_team_id=opponent.id,
        match_date=match_date,
        round_label=round_label,
        source_lineup_id=source_lineup_id,
        lines=lines,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def compute_outcome(
    lines: dict[str, Any],
    line_points: dict[str, int],
    scoring_mode: str,
) -> dict[str, Any]:
    """Derive the whole-tie result from per-line outcomes. Only recorded lines
    count (a partially-entered tie shows its current score, not a padded one).

    - match_count (silver): count won vs lost lines.
    - points (gold): sum each won line's points vs each lost line's points.
    """
    our = 0
    opp = 0
    for line_code, line in lines.items():
        outcome = line.get("outcome")
        if outcome not in ("win", "loss"):
            continue
        weight = line_points.get(line_code, 1) if scoring_mode == "points" else 1
        if outcome == "win":
            our += weight
        else:
            opp += weight
    return {"our": our, "opponent": opp, "scoring_mode": scoring_mode}
