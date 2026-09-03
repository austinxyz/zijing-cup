"""Find the legal lineups a roster can field.

Exhaustive branch and bound, not a heuristic. The page promises a ceiling that
no legal lineup can exceed, and a heuristic cannot honour that promise — it can
only say "this is the best I found".

The raw space looks hopeless: a 26-player roster admits about 29 billion
complete lineups. It collapses because women's doubles has very few legal pairs
(women are the scarce half of a roster), each cap prunes its line to a few dozen
or a few hundred pairs, and maximising the total means a near-optimal incumbent
appears early and cuts everything below it. Measured over all 24 real 2025
rosters, the worst case was 1.61s.

Objective: the participation UTR of the ten players on court, maximised.
Note this runs opposite to gold's second tiebreak, where the LOWER total wins a
4:4 tie. That tiebreak is out of scope, but nothing here should be read as
"filling the caps always wins".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from itertools import combinations
from typing import Iterable, Optional, Sequence

from app.lineups.rules import (
    Candidate,
    EligibilityLimit,
    LineRule,
    RuleSet,
    Violation,
    pair_total,
    slot_composition_error,
)
from app.lineups.rules import _limit_gender_for

Pair = tuple[Candidate, Candidate]


@dataclass(frozen=True)
class LineupCandidate:
    total: Decimal
    #: How much of the team's shared buffer this lineup spends.
    buffer_spent: Decimal
    lines: dict[str, Pair]

    @property
    def squad(self) -> frozenset[str]:
        """The ten players, regardless of which line each took."""
        return frozenset(p.key for pair in self.lines.values() for p in pair)


@dataclass(frozen=True)
class PlacedPlayer:
    """A named player and where the current input has put them: a line code
    (locked onto it) or "excluded". Read straight off placements."""
    name: str
    where: str


@dataclass(frozen=True)
class InfeasibilityReason:
    #: "gender_shortage" | "over_cap" | "over_gap" | "eligibility".
    kind: str
    #: Captain-facing Chinese; any number already formatted to a string.
    message: str
    #: Named players whose absence a user action explains. Filled only for
    #: gender_shortage (an exclude or a lock elsewhere took an eligible body).
    #: Always empty for the rule-or-attribute reasons (over_cap / over_gap /
    #: eligibility) — those are not something the user did.
    attributed: list[PlacedPlayer] = field(default_factory=list)


@dataclass(frozen=True)
class Infeasibility:
    """Why one line's candidate pool is empty. A read of the pool, never a
    second search, and never a claim about which lock is to blame."""
    line: str
    reasons: list[InfeasibilityReason]


@dataclass
class SearchResult:
    candidates: list[LineupCandidate] = field(default_factory=list)
    #: The best total reachable under the current locks and exclusions.
    ceiling: Optional[Decimal] = None
    #: How many distinct sets of ten reach that ceiling. One means the top has
    #: no choice in it; many means the choice is real.
    squads_at_ceiling: int = 0
    #: The line whose candidate pairs are empty under the current locks and
    #: exclusions. Set only when the constraints admit no lineup at all —
    #: distinct from "the search found nothing worth keeping", which an empty
    #: list alone cannot say apart.
    infeasible_line: Optional[str] = None
    #: The richer form of infeasible_line: the reasons that line's candidate
    #: pool is empty, plus attribution to the user's own excludes/locks when
    #: that is a fact the input can be read for. line == infeasible_line.
    infeasibility: Optional[Infeasibility] = None
    #: Where each unavailable player currently is: the line they are locked
    #: onto, or "excluded". Read straight off the input, so it costs nothing.
    #: Deliberately NOT an attribution of blame — naming the lock responsible
    #: would need a full search per lock and would still be wrong when several
    #: combine.
    placements: dict[str, str] = field(default_factory=dict)
    #: True when the search stopped at its node budget, so the results are a
    #: sample rather than the whole answer.
    truncated: bool = False
    #: Always False. The per-match ceiling on borrowed players depends on how
    #: many schools a team combines, which is not in the system — so this is
    #: stated rather than left silent, because silence reads as "checked".
    borrowed_players_checked: bool = False
    #: Locks the rules do not permit. A lock bypasses the per-line filter —
    #: that is what makes it a lock — so nothing downstream would catch it, and
    #: an unchecked one either yields a "legal" lineup that is not or an empty
    #: list that reads as "your roster cannot do it" when the truth is "you
    #: asked for something the rules forbid".
    invalid_locks: list[Violation] = field(default_factory=list)
    #: False when the search pruned a branch that could have tied the ceiling,
    #: which makes the count above a lower bound. Counting every tie exactly is
    #: cheap on most rosters and ruinous on a few: one real 26-player roster
    #: has 278 tied squads, and enumerating every arrangement of them took 35s
    #: against 1.4s for the same roster with ties pruned. So the count is exact
    #: when it can be had cheaply and honest about itself when it cannot.
    squads_at_ceiling_exact: bool = True


def _slot_ok(rule: LineRule, a: Candidate, b: Candidate) -> bool:
    return slot_composition_error(rule, (a, b)) is None


def check_locks(
    rules: RuleSet,
    locks: dict[str, Pair],
    blocked: set[str],
) -> list[Violation]:
    """Everything wrong with the locks themselves, before any searching.

    A locked pair is used verbatim as the only option for its line, so these
    are the rules nothing else will apply to it.
    """
    problems: list[Violation] = []
    by_code = {rule.code: rule for rule in rules.lines}
    placed: dict[str, str] = {}

    for code, pair in locks.items():
        rule = by_code.get(code)
        if rule is None:
            problems.append(Violation(
                code="unknown_line", line=code, amount=None,
                message=f"这个组别没有 {code} 这条线",
            ))
            continue

        problem = slot_composition_error(rule, pair)
        if problem is not None:
            problems.append(Violation(
                code="slot_composition", line=code, amount=None,
                message=f"{code}：{problem}",
            ))

        gap = abs(pair[0].match_utr - pair[1].match_utr)
        if gap > rules.partner_gap_max:
            problems.append(Violation(
                code="partner_gap", line=code, amount=gap - rules.partner_gap_max,
                message=f"{code} 锁定的搭档差距 {gap} 超过上限 {rules.partner_gap_max}",
            ))

        if rule.cap is not None:
            headroom = min(rules.buffer_per_line, rules.buffer_total)
            total = pair_total(pair)
            if total > rule.cap + headroom:
                problems.append(Violation(
                    code="line_cap", line=code, amount=total - rule.cap,
                    message=(
                        f"{code} 锁定的搭档 {total} 超出 cap {rule.cap}，"
                        f"连 buffer 一起也放不下"
                    ),
                ))

        # A line restriction is a property of the pair and the line, so it is
        # knowable here. Leaving it to the search means every branch is
        # rejected and the caller gets an empty list with nothing said.
        for limit in rules.limits:
            if limit.restricted_to_lines is None:
                continue
            if code in set(limit.restricted_to_lines):
                continue
            for person in pair:
                if _limit_gender_for(rule, person) != limit.gender:
                    continue
                if person.match_utr > limit.utr_above:
                    problems.append(Violation(
                        code="eligibility_line", line=code, amount=None,
                        message=(
                            f"{person.name} 的参赛 UTR 高于 {limit.utr_above}，"
                            f"只能打 {'/'.join(limit.restricted_to_lines)}，"
                            f"不能锁进 {code}"
                        ),
                    ))

        for person in pair:
            if person.key in blocked:
                problems.append(Violation(
                    code="locked_but_excluded", line=code, amount=None,
                    message=f"{person.name} 既被锁进 {code}，又被排除在本场之外",
                ))
            first = placed.get(person.key)
            if first is not None:
                problems.append(Violation(
                    code="duplicate_player", line=code, amount=None,
                    message=f"{person.name} 同时被锁进 {first} 与 {code}",
                ))
            else:
                placed[person.key] = code

    return problems


def _line_restriction_offenders(
    rules: RuleSet, rule: LineRule, pair: Pair
) -> list[tuple[Candidate, "EligibilityLimit"]]:
    """Players on this pair a high-UTR line restriction bars from this line.

    Restricting a high-UTR player to certain lines is a property of the player
    and the line — knowable per pair, exactly like check_locks decides it for a
    locked pair. Only restricted_to_lines is judged here; the per-match count
    limit is a whole-lineup question the search still owns.
    """
    offenders: list[tuple[Candidate, "EligibilityLimit"]] = []
    for limit in rules.limits:
        if limit.restricted_to_lines is None:
            continue
        if rule.code in set(limit.restricted_to_lines):
            continue
        for person in pair:
            if _limit_gender_for(rule, person) != limit.gender:
                continue
            if person.match_utr > limit.utr_above:
                offenders.append((person, limit))
    return offenders


def legal_pairs(rules: RuleSet, rule: LineRule, pool: Sequence[Candidate]) -> list[Pair]:
    """Every pair that could stand on this line on its own merits.

    The per-pair rules are applied here — the slot's gender, the gap, the
    ceiling this line could reach if the team spent its whole buffer on it, and
    a high-UTR restriction confining a player to other lines. Whether the team
    can afford the buffer across all five lines is decided during the search.
    """
    out: list[Pair] = []
    for a, b in combinations(pool, 2):
        if not _slot_ok(rule, a, b):
            continue
        if abs(a.match_utr - b.match_utr) > rules.partner_gap_max:
            continue
        if rule.cap is not None:
            headroom = min(rules.buffer_per_line, rules.buffer_total)
            if a.match_utr + b.match_utr > rule.cap + headroom:
                continue
        if _line_restriction_offenders(rules, rule, (a, b)):
            continue
        out.append((a, b))
    return out

def _over(rule: LineRule, pair: Pair) -> Decimal:
    if rule.cap is None:
        return Decimal(0)  # an open line cannot overspend a budget
    return max(Decimal(0), pair_total(pair) - rule.cap)


def _gender_need(rule: LineRule) -> dict[Optional[str], int]:
    """How many of each gender this line's slots require.

    Women's doubles is two women, mixed is one of each, men's doubles is any
    two (women are allowed to fill men's slots), keyed by None.
    """
    if rule.kind == "womens_doubles":
        return {"F": 2}
    if rule.kind == "mixed_doubles":
        return {"M": 1, "F": 1}
    return {None: 2}


_GENDER_LABEL = {"F": "女队员", "M": "男队员", None: "队员"}

LINE_KIND_LABEL = {
    "mens_doubles": "男双",
    "womens_doubles": "女双",
    "mixed_doubles": "混双",
}


def _display_name(raw: str) -> str:
    """Candidate.name joins the sheet's last/first columns with a tab; the
    display form drops the separator, matching the frontend's playerName."""
    return " ".join(part for part in raw.split("\t") if part)


def _attribution(
    gender: Optional[str],
    line: str,
    placements: dict[str, str],
    names: dict[str, str],
    roster_gender: dict[str, Optional[str]],
) -> list[PlacedPlayer]:
    """Named players of this gender the input has put out of this line's reach.

    Only excludes and locks-elsewhere — a user action the captain can undo.
    Read straight off placements; never a claim that undoing one yields a
    solution. Placed players are not in `available`, so their gender is looked
    up in the full-roster map. A specific-gender shortage counts only that
    gender; an any-gender (None) shortage counts everyone placed.
    """
    out: list[PlacedPlayer] = []
    for key, where in placements.items():
        if where == line:
            continue
        if gender is not None and roster_gender.get(key) != gender:
            continue
        raw = names.get(key)
        if raw is None:
            continue
        # Candidate.name joins the sheet's last/first columns with a tab; the
        # display form drops the separator, matching the frontend's playerName.
        display = " ".join(part for part in raw.split("\t") if part)
        out.append(PlacedPlayer(name=display, where=where))
    return out


def _diagnose_pinned(
    rules: RuleSet,
    rule: LineRule,
    available: Sequence[Candidate],
    pinned: Candidate,
) -> list[InfeasibilityReason]:
    """Why a pinned line is empty: the reasons no partner completes the pin.

    Scoped to pairs that include the pinned player — the only pairs that line
    can field — so the diagnosis names the pin and never reports a reason that
    would hold only for a pair the pin is not part of.
    """
    name = _display_name(pinned.name)
    prefix = f"你把 {name} 钉在 {rule.code}，但"
    slot_partners = [o for o in available if _slot_ok(rule, pinned, o)]
    if not slot_partners:
        return [InfeasibilityReason(
            kind="gender_shortage",
            message=f"{prefix}没有能与 {name} 组成合法{LINE_KIND_LABEL.get(rule.kind, rule.code)}的搭档",
        )]

    reasons: list[InfeasibilityReason] = []
    headroom = min(rules.buffer_per_line, rules.buffer_total)
    over_gap: list[Pair] = []
    over_cap: list[Pair] = []
    restricted: dict[str, tuple[Candidate, EligibilityLimit]] = {}
    for other in slot_partners:
        pair = (pinned, other)
        if abs(pinned.match_utr - other.match_utr) > rules.partner_gap_max:
            over_gap.append(pair)
            continue
        if rule.cap is not None and pinned.match_utr + other.match_utr > rule.cap + headroom:
            over_cap.append(pair)
            continue
        for person, limit in _line_restriction_offenders(rules, rule, pair):
            restricted.setdefault(person.key, (person, limit))

    if over_gap:
        reasons.append(InfeasibilityReason(
            kind="over_gap",
            message=f"{prefix}与 {name} 能配的每个搭档，参赛 UTR 差距都超过上限 {rules.partner_gap_max}",
        ))
    if over_cap:
        reasons.append(InfeasibilityReason(
            kind="over_cap",
            message=f"{prefix}与 {name} 能配的每个搭档，两人参赛 UTR 之和都超过 cap {rule.cap}（含 buffer {headroom}）",
        ))
    if restricted:
        who = "、".join(
            f"{person.name}（参赛 UTR 高于 {limit.utr_above}，只能打 {'/'.join(limit.restricted_to_lines)}）"
            for person, limit in restricted.values()
        )
        reasons.append(InfeasibilityReason(
            kind="eligibility",
            message=f"{prefix}够格的搭档被上场资格限制挡在本线外：{who}",
        ))
    return reasons


def diagnose_line(
    rules: RuleSet,
    rule: LineRule,
    available: Sequence[Candidate],
    placements: dict[str, str],
    names: dict[str, str],
    roster_gender: dict[str, Optional[str]],
    pinned: Optional[Candidate] = None,
) -> list[InfeasibilityReason]:
    """Why this line's candidate pool is empty — a read of `available`, the
    same pool legal_pairs uses, never a second search.

    Reasons can coexist and are all reported; no guess at a "main" one. When
    the line is a pin, the reasons are scoped to pairs including the pinned
    player (see _diagnose_pinned).
    """
    if pinned is not None:
        return _diagnose_pinned(rules, rule, available, pinned)

    reasons: list[InfeasibilityReason] = []

    need = _gender_need(rule)
    for gender, count in need.items():
        if gender is None:
            have = len(available)
        else:
            have = sum(1 for p in available if p.gender == gender)
        if have < count:
            reasons.append(InfeasibilityReason(
                kind="gender_shortage",
                message=(
                    f"{rule.code} 需要 {count} 名{_GENDER_LABEL[gender]}，"
                    f"当前可用只有 {have} 名"
                ),
                attributed=_attribution(
                    gender, rule.code, placements, names, roster_gender
                ),
            ))

    # Gender allowing, walk the slot-legal pairs and record the first rule each
    # one trips — the same order legal_pairs applies (gap, then cap). Because
    # the line is infeasible, no pair clears them all, so every slot-legal pair
    # lands in one of these buckets.
    headroom = min(rules.buffer_per_line, rules.buffer_total)
    over_gap: list[Pair] = []
    over_cap: list[Pair] = []
    #: Restricted players (keyed for stable order) seen barring an otherwise-ok
    #: pair from this line — a rule fact, so named but never attributed to the
    #: user.
    restricted: dict[str, tuple[Candidate, EligibilityLimit]] = {}
    for a, b in combinations(available, 2):
        if not _slot_ok(rule, a, b):
            continue
        if abs(a.match_utr - b.match_utr) > rules.partner_gap_max:
            over_gap.append((a, b))
            continue
        if rule.cap is not None and a.match_utr + b.match_utr > rule.cap + headroom:
            over_cap.append((a, b))
            continue
        offenders = _line_restriction_offenders(rules, rule, (a, b))
        if offenders:
            for person, limit in offenders:
                restricted.setdefault(person.key, (person, limit))
            continue

    if over_gap:
        reasons.append(InfeasibilityReason(
            kind="over_gap",
            message=(
                f"{rule.code} 能凑出组合，但每一对的参赛 UTR 差距都超过 "
                f"上限 {rules.partner_gap_max}"
            ),
        ))

    if over_cap:
        reasons.append(InfeasibilityReason(
            kind="over_cap",
            message=(
                f"{rule.code} 能凑出组合，但每一对的参赛 UTR 之和都超过 "
                f"cap {rule.cap}（含 buffer {headroom}）"
            ),
        ))

    if restricted:
        who = "、".join(
            f"{person.name}（参赛 UTR 高于 {limit.utr_above}，"
            f"按规则只能打 {'/'.join(limit.restricted_to_lines)}）"
            for person, limit in restricted.values()
        )
        reasons.append(InfeasibilityReason(
            kind="eligibility",
            message=(
                f"{rule.code} 够格的队员被上场资格限制挡在本线外：{who}"
            ),
        ))

    return reasons


def _eligibility_index(rules: RuleSet) -> dict[str, list[tuple]]:
    """For each line, the limits a player standing on it could trip.

    Built once. The check runs at every node of the search, and rebuilding the
    gender lookup and the allowed-line set there cost more than the check.
    Each entry is (limit index, threshold, allowed-or-None, gender-of-slot).
    """
    index: dict[str, list[tuple]] = {}
    for rule in rules.lines:
        entries = []
        for i, limit in enumerate(rules.limits):
            allowed = (
                None if limit.restricted_to_lines is None
                else frozenset(limit.restricted_to_lines)
            )
            entries.append((i, limit.utr_above, allowed, limit.gender, rule.kind))
        index[rule.code] = entries
    return index


def _eligibility_ok(
    rules: RuleSet,
    index: dict[str, list[tuple]],
    chosen: dict[str, Pair],
) -> bool:
    """Partial eligibility check, cheap enough to run at every node.

    Only judges what is already decided: a partial lineup can still gain
    players, so a count under the limit may yet break it — but one already over
    never comes back, and a player on a line they may not play never becomes
    legal either.
    """
    counts = [0] * len(rules.limits)
    for code, pair in chosen.items():
        for i, threshold, allowed, gender, kind in index[code]:
            for person in pair:
                effective = person.gender if kind == "mixed_doubles" else (
                    "F" if kind == "womens_doubles" else "M"
                )
                if effective != gender or person.match_utr <= threshold:
                    continue
                if allowed is not None and code not in allowed:
                    return False
                counts[i] += 1
                if counts[i] > rules.limits[i].max_players:
                    return False
    return True


def search_lineups(
    rules: RuleSet,
    roster: Sequence[Candidate],
    locks: Optional[dict[str, Pair]] = None,
    excluded: Iterable[str] = (),
    keep: int = 20,
    node_budget: int = 5_000_000,
    pins: Optional[dict[str, Candidate]] = None,
) -> SearchResult:
    """Every legal lineup worth keeping, strongest first.

    Lines are tried scarcest-first — women's doubles has the fewest legal pairs
    because women are the scarce half of a roster — so the branches that cannot
    go anywhere die at the top of the tree rather than the bottom.

    A `pin` fixes one player to a line and lets the engine choose the partner:
    that line's options are the legal pairs that include the pinned player, and
    the pinned player is taken out of every other line's pool. Conflicts (a
    player pinned twice, pinned and excluded, pinned and locked) are the
    caller's to reject before here.
    """
    locks = dict(locks or {})
    pins = dict(pins or {})
    blocked = set(excluded)

    # Before anything else: a lock the rules forbid is a different answer from
    # "no lineup exists", and the caller has to be able to tell them apart.
    lock_problems = check_locks(rules, locks, blocked)
    if lock_problems:
        return SearchResult(invalid_locks=lock_problems,
                            placements=_placements(locks, blocked))

    # Sorted by key so the answer depends on the roster, not on the order it
    # arrived in. With more ties than we keep, which of them survive follows
    # the enumeration order — and a caller passing the same players in a
    # different order would otherwise get a different set of recommendations.
    pool = sorted((p for p in roster if p.key not in blocked), key=lambda p: p.key)

    # A locked player is spoken for, so the other lines never had them to
    # begin with. Taking them out here is both faster and more truthful: a
    # line whose pairs all needed a locked player is empty, and that is the
    # thing worth reporting.
    committed = {p.key for pair in locks.values() for p in pair}
    # A pinned player is spoken for on their line, so the other lines never had
    # them either — take them out of the shared pool. Their partner is NOT
    # pre-committed; it is chosen from `available` during pairing.
    committed |= {person.key for person in pins.values()}
    available = [p for p in pool if p.key not in committed]

    options: dict[str, list[Pair]] = {}
    for rule in rules.lines:
        if rule.code in locks:
            options[rule.code] = [locks[rule.code]]
            continue
        if rule.code in pins:
            pin = pins[rule.code]
            # Bring the pinned player back into the pool just for this line, so
            # legal_pairs can pair them with the others, then keep only the
            # pairs that actually include them.
            pairs = [
                pair for pair in legal_pairs(rules, rule, [pin, *available])
                if pin.key in {p.key for p in pair}
            ]
            pairs.sort(key=lambda pair: -pair_total(pair))
            options[rule.code] = pairs
            continue
        pairs = legal_pairs(rules, rule, available)
        # Strongest first: the objective is a maximum, so a good branch early
        # raises the incumbent and prunes everything weaker.
        pairs.sort(key=lambda pair: -pair_total(pair))
        options[rule.code] = pairs

    # A line with nowhere to stand is why nothing can be built, and saying
    # which line turns "no lineup exists" into something to act on.
    for rule in rules.lines:
        if not options[rule.code]:
            placements = _placements(locks, blocked)
            names = {p.key: p.name for p in roster}
            roster_gender = {p.key: p.gender for p in roster}
            reasons = diagnose_line(
                rules, rule, available, placements, names, roster_gender,
                pinned=pins.get(rule.code),
            )
            return SearchResult(
                infeasible_line=rule.code,
                infeasibility=Infeasibility(line=rule.code, reasons=reasons),
                placements=placements,
            )

    mens_codes = [rule.code for rule in rules.lines if rule.kind == "mens_doubles"]
    elig_index = _eligibility_index(rules)

    # Scarcest line first.
    order = sorted(rules.lines, key=lambda rule: len(options[rule.code]))

    # The most any still-unassigned line could contribute.
    best_remaining: dict[str, Decimal] = {}
    running = Decimal(0)
    for rule in reversed(order):
        best_remaining[rule.code] = running
        pairs = options[rule.code]
        running += pair_total(pairs[0]) if pairs else Decimal(0)

    result = SearchResult(placements=_placements(locks, blocked))
    kept: list[LineupCandidate] = []
    nodes = 0
    truncated = False
    incumbent: Optional[Decimal] = None
    # Tracked outside `kept` because the count answers "is there a choice at
    # the top", so it has to be the real number. Counting inside the kept list
    # would cap it at `keep`, and once that list fills with ceiling-value
    # lineups the incumbent equals the ceiling and the remaining ties get
    # pruned away — a team with a hundred equally strong squads would report
    # however many happened to fit.
    best_total: Optional[Decimal] = None
    best_squads: set[frozenset[str]] = set()
    count_exact = True

    def recurse(depth: int, used: frozenset[str], chosen: dict[str, Pair],
                total: Decimal, spent: Decimal) -> None:
        nonlocal incumbent, best_total, count_exact, nodes, truncated
        if depth == len(order):
            candidate = LineupCandidate(total=total, buffer_spent=spent,
                                        lines=dict(chosen))
            if best_total is None or total > best_total:
                best_total = total
                best_squads.clear()
                best_squads.add(candidate.squad)
            elif total == best_total:
                best_squads.add(candidate.squad)
            kept.append(candidate)
            # Sorting the whole list at every leaf dominated the search on
            # tie-heavy rosters. Trim in batches instead; the incumbent only
            # needs to be a valid lower bound, and a slightly stale one prunes
            # a little less rather than wrongly.
            if len(kept) >= keep * 4:
                kept.sort(key=_ranking)
                del kept[keep:]
                incumbent = kept[-1].total
            return

        rule = order[depth]
        for pair in options[rule.code]:
            nodes += 1
            if nodes > node_budget:
                # Out of budget, not out of answers. Saying so is the whole
                # point: presenting a sample as the complete search would let
                # a captain conclude a lineup does not exist when it was
                # simply never reached.
                truncated = True
                return
            if pair[0].key in used or pair[1].key in used:
                continue
            over = _over(rule, pair)
            if over > rules.buffer_per_line and rules.buffer_per_line > 0:
                continue
            budget = spent + over
            if budget > rules.buffer_total:
                continue

            # The pairs are sorted strongest first and `best_remaining` is
            # fixed, so `reach` only falls as we walk the list: once one pair
            # cannot beat the incumbent, neither can any pair after it. Giving
            # up on the whole list here rather than testing each one is the
            # difference between seconds and tens of seconds on the rosters
            # that tie heavily.
            reach = total + pair_total(pair) + best_remaining[rule.code]
            if incumbent is not None and reach <= incumbent:
                if best_total is not None and reach == best_total:
                    # Abandoned, and these could have tied the ceiling — so the
                    # squad count below is a lower bound and says so.
                    count_exact = False
                break

            chosen[rule.code] = pair
            if _mens_order_ok(mens_codes, chosen) and _eligibility_ok(
                rules, elig_index, chosen
            ):
                recurse(depth + 1,
                        used | {pair[0].key, pair[1].key},
                        chosen,
                        total + pair_total(pair),
                        budget)
            del chosen[rule.code]

    recurse(0, frozenset(), {}, Decimal(0), Decimal(0))
    kept.sort(key=_ranking)
    result.truncated = truncated

    # Same ten players in different slots is one lineup, not several.
    seen: set[frozenset[str]] = set()
    deduped: list[LineupCandidate] = []
    for candidate in kept:
        if candidate.squad in seen:
            continue
        seen.add(candidate.squad)
        deduped.append(candidate)

    result.candidates = deduped
    result.ceiling = best_total
    result.squads_at_ceiling = len(best_squads)
    result.squads_at_ceiling_exact = count_exact
    return result


def _ranking(candidate: LineupCandidate) -> Decimal:
    """Strongest first.

    Nothing more is needed to make the list repeatable: the roster is sorted
    canonically before the search, the tree is walked in a fixed order, and
    Python's sort is stable — so equal totals keep the order they were found
    in, and that order is a function of the roster alone. An explicit tiebreak
    on the squad was tried and removed: no test could tell it apart from its
    absence, which is the definition of it not earning its place.
    """
    return -candidate.total


def _mens_order_ok(mens_codes: Sequence[str], chosen: dict[str, Pair]) -> bool:
    """The men's doubles lines must not improve down the order.

    Checked on the partial lineup so an inversion prunes its whole subtree
    rather than surfacing at the leaves.
    """
    picked = [chosen[code] for code in mens_codes if code in chosen]
    for above, below in zip(picked, picked[1:]):
        if pair_total(below) > pair_total(above):
            return False
    return True


def _placements(locks: dict[str, Pair], blocked: set[str]) -> dict[str, str]:
    """Where every unavailable player currently is.

    A restatement of the input, not a diagnosis: it says a player is locked
    onto MD or sitting the match out, and stops there. Which lock caused a
    line to run dry is a question this deliberately does not answer.
    """
    placements: dict[str, str] = {}
    for code, pair in locks.items():
        for person in pair:
            placements[person.key] = code
    for key in blocked:
        placements[key] = "excluded"
    return placements
