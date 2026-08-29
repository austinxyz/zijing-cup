"""Read a division's rules and a team's roster, run the engine, shape the reply.

This is the only place in the lineup feature that touches the database. The
constraint and search code stays pure so it can be tested against hand-built
rosters; everything database-shaped lives here.

Nothing is persisted. A lineup is a suggestion recomputed on demand, so the
endpoint above this module is a GET and locks travel in the query string.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Session, select

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet
from app.lineups.search import SearchResult, search_lineups
from app.models import (
    Division,
    DivisionEligibilityLimit,
    DivisionLine,
    RosterEntry,
    Team,
)


class UnknownReference(ValueError):
    """A lock or exclusion naming a line or player this team does not have.

    A caller's own mistake, so it is a 4xx. Dropping it silently would answer
    a different question than the one asked, and look like a working search.
    """


class PlayerOut(BaseModel):
    #: Stable identifier a caller echoes back to lock or exclude this player.
    #: Names repeat on a real roster, so they cannot serve as the key.
    key: str
    last_name: str
    first_name: str

    #: Required on screen: the high-UTR limits are written per gender, so a
    #: lineup shown without it cannot be checked against that rule by eye.
    gender: Optional[str] = None
    match_utr: Decimal


class LineTotalOut(BaseModel):
    total: Decimal
    #: null on an open line — nothing to exceed, so nothing to report.
    cap: Optional[Decimal] = None
    #: How far past the cap this line sits; 0 when within it.
    over: Decimal


class CandidateOut(BaseModel):
    total: Decimal
    buffer_spent: Decimal
    lines: dict[str, tuple[PlayerOut, PlayerOut]]
    line_totals: dict[str, LineTotalOut]


class ViolationOut(BaseModel):
    code: str
    line: Optional[str] = None
    amount: Optional[Decimal] = None
    message: str


class LineupSearchOut(BaseModel):
    candidates: list[CandidateOut]
    ceiling: Optional[Decimal] = None
    squads_at_ceiling: int = 0
    #: False when ties were pruned, which makes the count above a lower bound.
    squads_at_ceiling_exact: bool = True

    #: The highest total the rules permit at all — every line at its cap plus
    #: the team buffer. The gap against `ceiling` is what this roster, these
    #: locks and these exclusions cost, and the client cannot compute it
    #: without the caps. null when any line is open, because then no such
    #: maximum exists — a large number in its place would invite exactly the
    #: comparison that has no meaning.
    rules_ceiling: Optional[Decimal] = None

    #: Set when some line has no legal pair at all. Distinct from an empty
    #: candidate list, which reads as "searched, found nothing worth keeping".
    infeasible_line: Optional[str] = None

    #: Where each unavailable player is: a line code, or "excluded". Read off
    #: the input — NOT a claim about which lock made the search infeasible.
    placements: dict[str, str] = {}

    truncated: bool = False

    #: Always false. The per-match ceiling on borrowed players depends on how
    #: many schools a team combines, which this system does not know; silence
    #: would read as "checked".
    borrowed_players_checked: bool = False

    invalid_locks: list[ViolationOut] = []

    #: The roster the search drew from, so a caller can offer locks and
    #: exclusions without a second request — and so the keys it must send
    #: back come from the same response.
    roster: list[PlayerOut] = []


def load_ruleset(session: Session, year: int, code: str) -> Optional[RuleSet]:
    """The division's rule values, or None when that division does not exist.

    Every number here is data. Caps, buffers, the gap limit and the high-UTR
    thresholds change per season and per division, so none of them may harden
    into a constant in the engine.
    """
    division = session.exec(
        select(Division).where(Division.season_year == year, Division.code == code)
    ).one_or_none()
    if division is None:
        return None

    lines = session.exec(
        select(DivisionLine)
        .where(DivisionLine.division_id == division.id)
        .order_by(DivisionLine.sort_order)
    ).all()
    limits = session.exec(
        select(DivisionEligibilityLimit).where(
            DivisionEligibilityLimit.division_id == division.id
        )
    ).all()

    return RuleSet(
        lines=[LineRule(line.code, line.kind, line.cap) for line in lines],
        buffer_per_line=division.buffer_per_line,
        buffer_total=division.buffer_total,
        partner_gap_max=division.partner_gap_max,
        limits=[
            EligibilityLimit(
                limit.gender,
                limit.utr_above,
                limit.max_players,
                limit.restricted_to_lines,
            )
            for limit in limits
        ],
    )


def load_roster(
    session: Session, year: int, code: str, team_code: str
) -> Optional[list[Candidate]]:
    """The team's players as the engine needs them, or None for no such team.

    None rather than an empty list: "no such team" and "a team with nobody on
    it" are different answers and only one of them can be true at a time.
    """
    team = session.exec(
        select(Team).where(
            Team.season_year == year,
            Team.division_code == code,
            Team.code == team_code,
        )
    ).one_or_none()
    if team is None:
        return None

    entries = session.exec(
        select(RosterEntry)
        .where(RosterEntry.team_id == team.id)
        .order_by(RosterEntry.id)
    ).all()
    return [
        Candidate(
            key=str(entry.id),
            name=f"{entry.last_name}\t{entry.first_name}",
            gender=entry.gender,
            match_utr=entry.match_utr,
        )
        for entry in entries
    ]


def _player_out(candidate: Candidate) -> PlayerOut:
    last, _, first = candidate.name.partition("\t")
    return PlayerOut(
        key=candidate.key,
        last_name=last,
        first_name=first,
        gender=candidate.gender,
        match_utr=candidate.match_utr,
    )


def rules_ceiling(rules: RuleSet) -> Optional[Decimal]:
    """Every line at its cap, plus the whole team buffer.

    None when any line is open: an open line has no ceiling, so neither does
    the lineup.
    """
    total = Decimal(0)
    for line in rules.lines:
        if line.cap is None:
            return None
        total += line.cap
    return total + rules.buffer_total


def to_output(
    rules: RuleSet, roster: list[Candidate], result: SearchResult
) -> LineupSearchOut:
    caps = {line.code: line.cap for line in rules.lines}

    candidates: list[CandidateOut] = []
    for candidate in result.candidates:
        line_totals: dict[str, LineTotalOut] = {}
        for code, pair in candidate.lines.items():
            total = pair[0].match_utr + pair[1].match_utr
            cap = caps.get(code)
            over = Decimal(0) if cap is None else max(Decimal(0), total - cap)
            line_totals[code] = LineTotalOut(total=total, cap=cap, over=over)
        candidates.append(
            CandidateOut(
                total=candidate.total,
                buffer_spent=candidate.buffer_spent,
                lines={
                    code: (_player_out(pair[0]), _player_out(pair[1]))
                    for code, pair in candidate.lines.items()
                },
                line_totals=line_totals,
            )
        )

    return LineupSearchOut(
        candidates=candidates,
        ceiling=result.ceiling,
        squads_at_ceiling=result.squads_at_ceiling,
        squads_at_ceiling_exact=result.squads_at_ceiling_exact,
        rules_ceiling=rules_ceiling(rules),
        infeasible_line=result.infeasible_line,
        placements=result.placements,
        truncated=result.truncated,
        borrowed_players_checked=result.borrowed_players_checked,
        invalid_locks=[
            ViolationOut(code=v.code, line=v.line, amount=v.amount, message=v.message)
            for v in result.invalid_locks
        ],
        roster=[_player_out(player) for player in roster],
    )


def search_team_lineups(
    session: Session,
    year: int,
    code: str,
    team_code: str,
    locks: Optional[dict[str, tuple[str, str]]] = None,
    excluded: Optional[list[str]] = None,
    keep: int = 20,
) -> Optional[LineupSearchOut]:
    """The search for one team, or None when the division or team is unknown."""
    rules = load_ruleset(session, year, code)
    if rules is None:
        return None
    roster = load_roster(session, year, code, team_code)
    if roster is None:
        return None

    line_codes = {line.code for line in rules.lines}
    by_key = {player.key: player for player in roster}

    resolved: dict[str, tuple[Candidate, Candidate]] = {}
    for line_code, (first, second) in (locks or {}).items():
        if line_code not in line_codes:
            raise UnknownReference(f"unknown line: {line_code}")
        for key in (first, second):
            if key not in by_key:
                raise UnknownReference(f"unknown player: {key}")
        if first == second:
            raise UnknownReference(f"a player cannot partner themselves: {first}")
        resolved[line_code] = (by_key[first], by_key[second])

    for key in excluded or []:
        if key not in by_key:
            raise UnknownReference(f"unknown player: {key}")

    result = search_lineups(
        rules, roster, locks=resolved, excluded=excluded or (), keep=keep
    )
    return to_output(rules, roster, result)
