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
    LineRule,
    RuleSet,
    Violation,
    pair_total,
    slot_composition_error,
)

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


@dataclass
class SearchResult:
    candidates: list[LineupCandidate] = field(default_factory=list)
    #: The best total reachable under the current locks and exclusions.
    ceiling: Optional[Decimal] = None
    #: How many distinct sets of ten reach that ceiling. One means the top has
    #: no choice in it; many means the choice is real.
    squads_at_ceiling: int = 0
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


def legal_pairs(rules: RuleSet, rule: LineRule, pool: Sequence[Candidate]) -> list[Pair]:
    """Every pair that could stand on this line on its own merits.

    Only the per-pair rules are applied here — the gap, the slot's gender, and
    the ceiling this line could reach if the team spent its whole buffer on it.
    Whether the team can actually afford that is a question about the lineup as
    a whole, decided during the search.
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
        out.append((a, b))
    return out

def _over(rule: LineRule, pair: Pair) -> Decimal:
    if rule.cap is None:
        return Decimal(0)  # an open line cannot overspend a budget
    return max(Decimal(0), pair_total(pair) - rule.cap)


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
) -> SearchResult:
    """Every legal lineup worth keeping, strongest first.

    Lines are tried scarcest-first — women's doubles has the fewest legal pairs
    because women are the scarce half of a roster — so the branches that cannot
    go anywhere die at the top of the tree rather than the bottom.
    """
    locks = dict(locks or {})
    blocked = set(excluded)

    # Before anything else: a lock the rules forbid is a different answer from
    # "no lineup exists", and the caller has to be able to tell them apart.
    lock_problems = check_locks(rules, locks, blocked)
    if lock_problems:
        return SearchResult(invalid_locks=lock_problems)

    # Sorted by key so the answer depends on the roster, not on the order it
    # arrived in. With more ties than we keep, which of them survive follows
    # the enumeration order — and a caller passing the same players in a
    # different order would otherwise get a different set of recommendations.
    pool = sorted((p for p in roster if p.key not in blocked), key=lambda p: p.key)

    by_code = {rule.code: rule for rule in rules.lines}
    options: dict[str, list[Pair]] = {}
    for rule in rules.lines:
        if rule.code in locks:
            options[rule.code] = [locks[rule.code]]
            continue
        pairs = legal_pairs(rules, rule, pool)
        # Strongest first: the objective is a maximum, so a good branch early
        # raises the incumbent and prunes everything weaker.
        pairs.sort(key=lambda pair: -pair_total(pair))
        options[rule.code] = pairs

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

    result = SearchResult()
    kept: list[LineupCandidate] = []
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
        nonlocal incumbent, best_total, count_exact
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
