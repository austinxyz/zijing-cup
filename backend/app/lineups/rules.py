"""Is this lineup legal, and if not, which rule did it break and by how much.

Pure: rule values and roster rows in, violations out. No database — the
constraint logic is where the subtle errors live, and it has to be testable
with awkward hand-built combinations rather than whatever a seeded team
happens to contain.

Every value is a Decimal end to end. Participation UTRs are exact decimals and
these rules are decided at the boundary: 10.25 and 10.2 are different answers
against a cap, and a float that creeps in fails only there, which is the
hardest place to notice.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from decimal import Decimal
from typing import Optional, Sequence


@dataclass(frozen=True)
class Candidate:
    """A player as the engine needs them: identity, gender, participation UTR."""

    key: str
    name: str
    gender: Optional[str]
    match_utr: Decimal


@dataclass(frozen=True)
class LineRule:
    code: str
    kind: str
    #: None is an open line — no ceiling at all. Not a sentinel, not a large
    #: number: the absence of a limit is itself the rule.
    cap: Optional[Decimal] = None


@dataclass(frozen=True)
class EligibilityLimit:
    """At most `max_players` of `gender` above `utr_above`, optionally confined
    to certain lines. `restricted_to_lines` of None means any line."""

    gender: str
    utr_above: Decimal
    max_players: int
    restricted_to_lines: Optional[Sequence[str]] = None


@dataclass(frozen=True)
class RuleSet:
    lines: Sequence[LineRule]
    buffer_per_line: Decimal
    buffer_total: Decimal
    partner_gap_max: Decimal
    limits: Sequence[EligibilityLimit] = field(default_factory=tuple)

    def replace(self, **changes) -> "RuleSet":
        return replace(self, **changes)


@dataclass(frozen=True)
class Violation:
    #: A stable identifier for the rule broken, for callers that branch on it.
    code: str
    #: The line it happened on, or None for lineup-wide rules.
    line: Optional[str]
    #: How far over the limit, so the report is actionable rather than a verdict.
    amount: Optional[Decimal]
    message: str


@dataclass(frozen=True)
class LegalityReport:
    violations: Sequence[Violation]

    @property
    def is_legal(self) -> bool:
        return not self.violations


Lineup = dict[str, tuple[Candidate, Candidate]]


def pair_total(pair: tuple[Candidate, Candidate]) -> Decimal:
    return pair[0].match_utr + pair[1].match_utr


def _check_caps(rules: RuleSet, lineup: Lineup) -> tuple[list[Violation], Decimal]:
    """Per-line ceilings, plus how much of the team's buffer they spent.

    The overage total comes back with the violations because buffer is a budget
    the whole team shares — the decision about it cannot be made line by line.
    """
    violations: list[Violation] = []
    spent = Decimal(0)

    for rule in rules.lines:
        pair = lineup.get(rule.code)
        if pair is None or rule.cap is None:
            continue  # an open line has no ceiling to exceed, nothing to spend
        total = pair_total(pair)
        over = total - rule.cap
        if over <= 0:
            continue
        spent += over

        if rules.buffer_per_line <= 0:
            violations.append(Violation(
                code="line_cap",
                line=rule.code,
                amount=over,
                message=f"{rule.code} 的参赛 UTR 之和 {total} 超出 cap {rule.cap} {over}",
            ))
        elif over > rules.buffer_per_line:
            violations.append(Violation(
                code="buffer_per_line",
                line=rule.code,
                amount=over - rules.buffer_per_line,
                message=(
                    f"{rule.code} 超出 cap {over}，"
                    f"单线最多只能超 {rules.buffer_per_line}"
                ),
            ))

    return violations, spent


def _check_budget(rules: RuleSet, spent: Decimal) -> list[Violation]:
    """The overages judged together.

    Checking each line alone passes five lines at 0.2 over while the team has
    spent 1.0 of a 0.5 allowance. This is the check that catches that.

    Skipped where there is no budget at all — 2025 had no buffer system, so
    every offending line has already reported itself and adding "the team
    overspent" would report one broken rule twice.
    """
    if rules.buffer_total <= 0 or spent <= rules.buffer_total:
        return []
    return [Violation(
        code="buffer_total",
        line=None,
        amount=spent - rules.buffer_total,
        message=f"五线超出量合计 {spent}，全队 buffer 额度只有 {rules.buffer_total}",
    )]


def _check_partner_gap(rules: RuleSet, lineup: Lineup) -> list[Violation]:
    violations: list[Violation] = []
    for rule in rules.lines:
        pair = lineup.get(rule.code)
        if pair is None:
            continue
        gap = abs(pair[0].match_utr - pair[1].match_utr)
        if gap > rules.partner_gap_max:
            violations.append(Violation(
                code="partner_gap",
                line=rule.code,
                amount=gap - rules.partner_gap_max,
                message=f"{rule.code} 搭档差距 {gap} 超过上限 {rules.partner_gap_max}",
            ))
    return violations


def _check_mens_order(rules: RuleSet, lineup: Lineup) -> list[Violation]:
    """The men's doubles lines must not improve down the order.

    A stronger D2 than D1 is the 田忌赛马 the rule forbids. Equal is not an
    inversion — two lines routinely land on the same total when both are pushed
    against their caps.
    """
    violations: list[Violation] = []
    mens = [rule.code for rule in rules.lines if rule.kind == "mens_doubles"]
    for higher, lower in zip(mens, mens[1:]):
        if higher not in lineup or lower not in lineup:
            continue
        above, below = pair_total(lineup[higher]), pair_total(lineup[lower])
        if below > above:
            violations.append(Violation(
                code="mens_doubles_order",
                line=lower,
                amount=below - above,
                message=f"{lower} 的参赛 UTR 之和 {below} 高于 {higher} 的 {above}",
            ))
    return violations


def _check_distinct(rules: RuleSet, lineup: Lineup) -> list[Violation]:
    """Ten distinct people take the court."""
    violations: list[Violation] = []
    seen: dict[str, str] = {}
    for rule in rules.lines:
        pair = lineup.get(rule.code)
        if pair is None:
            continue
        for person in pair:
            first = seen.get(person.key)
            if first is not None:
                violations.append(Violation(
                    code="duplicate_player",
                    line=rule.code,
                    amount=None,
                    message=f"{person.name} 同时出现在 {first} 与 {rule.code}",
                ))
            else:
                seen[person.key] = rule.code
    return violations


def _limit_gender_for(rule: LineRule, person: Candidate) -> Optional[str]:
    """Whose limit applies to this player on this line.

    A woman filling a men's slot is judged by the men's limit — judging her by
    the women's threshold would let an extra player past the men's cap. Only
    mixed doubles asks who the player actually is.
    """
    if rule.kind == "mixed_doubles":
        return person.gender
    return "F" if rule.kind == "womens_doubles" else "M"


def _check_eligibility(rules: RuleSet, lineup: Lineup) -> list[Violation]:
    """High-UTR limits constrain both how many such players take the court and
    which lines they may take it on. Checking only the count would pass a
    lineup that seats a D1-or-MD-only player on D2."""
    violations: list[Violation] = []

    for limit in rules.limits:
        matched: list[tuple[str, Candidate]] = []
        for rule in rules.lines:
            pair = lineup.get(rule.code)
            if pair is None:
                continue
            for person in pair:
                if _limit_gender_for(rule, person) != limit.gender:
                    continue
                if person.match_utr > limit.utr_above:
                    matched.append((rule.code, person))

        if len(matched) > limit.max_players:
            violations.append(Violation(
                code="eligibility_count",
                line=None,
                amount=Decimal(len(matched) - limit.max_players),
                message=(
                    f"UTR 高于 {limit.utr_above} 的{limit.gender}队员上场 "
                    f"{len(matched)} 名，上限 {limit.max_players} 名"
                ),
            ))

        if limit.restricted_to_lines is None:
            continue  # None means any line — not "no line"
        allowed = set(limit.restricted_to_lines)
        allowed_text = "/".join(limit.restricted_to_lines)
        for line_code, person in matched:
            if line_code not in allowed:
                violations.append(Violation(
                    code="eligibility_line",
                    line=line_code,
                    amount=None,
                    message=(
                        f"{person.name} 的参赛 UTR 高于 {limit.utr_above}，"
                        f"只能打 {allowed_text}"
                    ),
                ))

    return violations


def check_lineup(rules: RuleSet, lineup: Lineup) -> LegalityReport:
    """Legality is the conjunction of the rules below: a lineup is legal only
    when none of them has anything to say about it."""
    cap_violations, spent = _check_caps(rules, lineup)

    violations = [
        *cap_violations,
        *_check_budget(rules, spent),
        *_check_partner_gap(rules, lineup),
        *_check_mens_order(rules, lineup),
        *_check_distinct(rules, lineup),
        *_check_eligibility(rules, lineup),
    ]
    return LegalityReport(violations=tuple(violations))
