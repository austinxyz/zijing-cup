"""Read a division's rules and a team's roster, run the engine, shape the reply.

This is the only place in the lineup feature that touches the database. The
constraint and search code stays pure so it can be tested against hand-built
rosters; everything database-shaped lives here.

Nothing is persisted. A lineup is a suggestion recomputed on demand, so the
endpoint above this module is a GET and locks travel in the query string.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Session, select

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet
from app.lineups.search import SearchResult, search_lineups
from app.models import (
    Division,
    DivisionBorrowedLimit,
    DivisionEligibilityLimit,
    DivisionLine,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Team,
)
from app.players.utr_chain import (
    ResolvedUtr,
    SeasonUtrView,
    UtrOrigin,
    resolve_match_utr,
)

#: Prefixes every player key. The old keys were `roster_entries` ids — bare
#: integers, as `players` ids are — so a stale shared link would have parsed
#: cleanly and locked two unrelated people into a lineup that looked legal.
#: The prefix is what makes that link fail instead.
KEY_PREFIX = "p"


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

    #: Where this number came from. A derived value sits exactly where its
    #: size puts it, so without a mark on the number itself nothing on the
    #: card distinguishes it from one the committee froze.
    origin: UtrOrigin
    origin_year: Optional[int] = None
    is_unresolved: bool = False


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


class PlacedPlayerOut(BaseModel):
    #: A named player and where the input has put them: a line code, or
    #: "excluded".
    name: str
    where: str


class InfeasibilityReasonOut(BaseModel):
    #: "gender_shortage" | "over_cap" | "over_gap" | "eligibility".
    kind: str
    message: str
    #: Named players an exclude or a lock-elsewhere accounts for. Empty for the
    #: rule/attribute reasons (over_cap / over_gap / eligibility) — not the
    #: user's doing.
    attributed: list[PlacedPlayerOut] = []


class InfeasibilityOut(BaseModel):
    #: The line whose candidate pool is empty; equals infeasible_line.
    line: str
    #: Why, as facts read off the pool — never a claim about which lock is to
    #: blame.
    reasons: list[InfeasibilityReasonOut]


class BorrowedOverLimitOut(BaseModel):
    #: The borrowed players on court in one over-the-cap lineup, and the numbers.
    names: list[str]
    on_court: int
    cap: int


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

    #: The richer form of infeasible_line: why that line's pool is empty, and
    #: attribution to the user's own excludes/locks where the input shows it.
    #: null when the search is feasible. line == infeasible_line.
    infeasibility: Optional[InfeasibilityOut] = None

    #: Where each unavailable player is: a line code, or "excluded". Read off
    #: the input — NOT a claim about which lock made the search infeasible.
    placements: dict[str, str] = {}

    truncated: bool = False

    #: Whether the per-match borrowed ceiling was enforced. True when the team's
    #: school_count is set (a cap is known); false when unset — silence would
    #: read as "checked".
    borrowed_players_checked: bool = False

    #: Set only when the borrowed cap is what makes the team infeasible: no line
    #: is empty, but every lineup exceeds the on-court borrowed ceiling. Names
    #: the borrowed players in one such lineup and the cap they broke.
    borrowed_over_limit: Optional[BorrowedOverLimitOut] = None

    invalid_locks: list[ViolationOut] = []

    #: The roster the search drew from, so a caller can offer locks and
    #: exclusions without a second request — and so the keys it must send
    #: back come from the same response.
    roster: list[PlayerOut] = []

    #: On the team but with no derivable participation UTR, so not in the
    #: search at all. Reported rather than dropped: the ceiling and every
    #: candidate above are computed over the rest.
    missing_utr_count: int = 0

    #: How many players in the search are playing on a derived number.
    estimated_count: int = 0

    #: How many are on a season value nobody has ruled on. The larger of the
    #: two candidates was used.
    unresolved_count: int = 0


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


@dataclass(frozen=True)
class LoadedRoster:
    """The engine's candidates, plus what had to be left out to build them."""

    candidates: list[Candidate]

    #: On the team but with no participation UTR the chain could derive. They
    #: cannot be placed, and the count has to travel with the result: the
    #: ceiling and every candidate are computed over the rest, so silence
    #: would present a partial answer as the whole squad's.
    missing_utr_count: int = 0

    #: Playing with a derived number. Legality is a property of the whole
    #: lineup, so one estimate makes "this is legal" itself an estimate.
    estimated_count: int = 0

    #: Season values with two candidates and no ruling. The larger is used.
    unresolved_count: int = 0

    #: Player key -> where that player's number came from. Kept beside the
    #: candidates rather than on `Candidate` itself: the engine is pure and
    #: has no business carrying provenance through the search.
    provenance: dict[str, ResolvedUtr] = field(default_factory=dict)

    #: How many schools this team combines, or None if unset. Drives the
    #: per-match borrowed cap; None means the cap is not enforced.
    school_count: Optional[int] = None


def load_roster(
    session: Session, year: int, code: str, team_code: str
) -> Optional[LoadedRoster]:
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

    memberships = session.exec(
        select(PlayerTeamMembership, Player)
        .join(Player, Player.id == PlayerTeamMembership.player_id)
        .where(PlayerTeamMembership.team_id == team.id)
        .order_by(PlayerTeamMembership.id)
    ).all()

    player_ids = [player.id for _, player in memberships]
    seasons_by_player: dict[int, list[SeasonUtrView]] = {}
    if player_ids:
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

    candidates: list[Candidate] = []
    provenance: dict[str, ResolvedUtr] = {}
    missing = estimated = unresolved = 0
    for membership, player in memberships:
        resolved = resolve_match_utr(
            season_utrs=seasons_by_player.get(player.id, []),
            current_doubles=player.doubles_utr,
            current_doubles_status=player.doubles_status,
            season_year=year,
        )
        if resolved is None:
            # Unlike the roster page, which still lists him: there is no
            # number to place him with, so he cannot be in a lineup. He is
            # counted instead of dropped quietly.
            missing += 1
            continue
        if resolved.origin is not UtrOrigin.FROZEN:
            estimated += 1
        if resolved.is_unresolved:
            unresolved += 1
        provenance[f"{KEY_PREFIX}{player.id}"] = resolved
        candidates.append(
            Candidate(
                key=f"{KEY_PREFIX}{player.id}",
                name=f"{player.last_name}	{player.first_name}",
                gender=player.gender,
                match_utr=resolved.value,
                borrowed=bool(membership.is_borrowed_player),
            )
        )

    return LoadedRoster(
        candidates=candidates,
        missing_utr_count=missing,
        estimated_count=estimated,
        unresolved_count=unresolved,
        provenance=provenance,
        school_count=team.school_count,
    )


def _player_out(
    candidate: Candidate, provenance: dict[str, ResolvedUtr]
) -> PlayerOut:
    last, _, first = candidate.name.partition("\t")
    # Indexed, not `.get` with a default: every candidate came out of
    # `load_roster`, so a miss is a bug in this module. Falling back to
    # "frozen" would answer the reader's question with a wrong label, which
    # is worse than crashing where the mistake actually is.
    resolved = provenance[candidate.key]
    return PlayerOut(
        key=candidate.key,
        last_name=last,
        first_name=first,
        gender=candidate.gender,
        match_utr=candidate.match_utr,
        origin=resolved.origin,
        origin_year=resolved.origin_year,
        is_unresolved=resolved.is_unresolved,
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
    rules: RuleSet, loaded: LoadedRoster, result: SearchResult
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
                    code: (
                        _player_out(pair[0], loaded.provenance),
                        _player_out(pair[1], loaded.provenance),
                    )
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
        infeasibility=(
            InfeasibilityOut(
                line=result.infeasibility.line,
                reasons=[
                    InfeasibilityReasonOut(
                        kind=reason.kind,
                        message=reason.message,
                        attributed=[
                            PlacedPlayerOut(name=p.name, where=p.where)
                            for p in reason.attributed
                        ],
                    )
                    for reason in result.infeasibility.reasons
                ],
            )
            if result.infeasibility is not None
            else None
        ),
        placements=result.placements,
        truncated=result.truncated,
        borrowed_players_checked=result.borrowed_players_checked,
        borrowed_over_limit=(
            BorrowedOverLimitOut(
                names=result.borrowed_over_limit.names,
                on_court=result.borrowed_over_limit.on_court,
                cap=result.borrowed_over_limit.cap,
            )
            if result.borrowed_over_limit is not None
            else None
        ),
        invalid_locks=[
            ViolationOut(code=v.code, line=v.line, amount=v.amount, message=v.message)
            for v in result.invalid_locks
        ],
        roster=[
            _player_out(player, loaded.provenance)
            for player in loaded.candidates
        ],
        missing_utr_count=loaded.missing_utr_count,
        estimated_count=loaded.estimated_count,
        unresolved_count=loaded.unresolved_count,
    )


def _borrowed_on_court_cap(
    session: Session, year: int, code: str, school_count: Optional[int]
) -> Optional[int]:
    """The per-match borrowed ceiling for a team of `school_count` schools in
    this division, or None when it cannot be determined (school_count unset, or
    no rule row for that count) — None means "do not enforce"."""
    if school_count is None:
        return None
    division = session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == code
        )
    ).one_or_none()
    if division is None:
        return None
    row = session.exec(
        select(DivisionBorrowedLimit).where(
            DivisionBorrowedLimit.division_id == division.id,
            DivisionBorrowedLimit.school_count == school_count,
        )
    ).one_or_none()
    return row.on_court_cap if row is not None else None


def search_team_lineups(
    session: Session,
    year: int,
    code: str,
    team_code: str,
    locks: Optional[dict[str, tuple[str, str]]] = None,
    excluded: Optional[list[str]] = None,
    keep: int = 20,
    pins: Optional[dict[str, str]] = None,
) -> Optional[LineupSearchOut]:
    """The search for one team, or None when the division or team is unknown."""
    rules = load_ruleset(session, year, code)
    if rules is None:
        return None
    loaded = load_roster(session, year, code, team_code)
    if loaded is None:
        return None
    roster = loaded.candidates
    borrowed_cap = _borrowed_on_court_cap(session, year, code, loaded.school_count)

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

    resolved_pins: dict[str, Candidate] = {}
    excluded_set = set(excluded or [])
    locked_members = {p.key for pair in resolved.values() for p in pair}
    seen_pins: set[str] = set()
    for line_code, key in (pins or {}).items():
        if line_code not in line_codes:
            raise UnknownReference(f"unknown line: {line_code}")
        if key not in by_key:
            raise UnknownReference(f"unknown player: {key}")
        # A pin says "must play here"; conflicts with the opposite claims are
        # rejected rather than silently resolved one way.
        if key in seen_pins:
            raise UnknownReference(f"a player cannot be pinned to two lines: {key}")
        if key in excluded_set:
            raise UnknownReference(f"a player cannot be both pinned and excluded: {key}")
        if key in locked_members:
            raise UnknownReference(f"a player cannot be both pinned and locked: {key}")
        seen_pins.add(key)
        resolved_pins[line_code] = by_key[key]

    result = search_lineups(
        rules, roster, locks=resolved, excluded=excluded or (), keep=keep,
        pins=resolved_pins, borrowed_cap=borrowed_cap,
    )
    return to_output(rules, loaded, result)
