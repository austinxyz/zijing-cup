"""Lineup legality: the constraint set, checked as a conjunction.

Pure functions — rule values and roster rows in, violations out. No database,
so the awkward combinations can be built directly rather than seeded.

Every number here is a Decimal. 10.25 and 10.2 are different answers against a
cap, and a float that creeps in fails only at the boundary, which is exactly
where these rules live.

All names are invented.
"""

from decimal import Decimal

import pytest

from app.lineups.rules import (
    Candidate,
    EligibilityLimit,
    LineRule,
    RuleSet,
    check_lineup,
)

D = Decimal

# Silver 2026 — every line capped, a shared buffer of 0.5.
SILVER = RuleSet(
    lines=[
        LineRule("D1", "mens_doubles", D("13.00")),
        LineRule("D2", "mens_doubles", D("12.00")),
        LineRule("D3", "mens_doubles", D("11.00")),
        LineRule("MD", "mixed_doubles", D("10.25")),
        LineRule("WD", "womens_doubles", D("9.25")),
    ],
    buffer_per_line=D("0.5"),
    buffer_total=D("0.5"),
    partner_gap_max=D("3.50"),
    limits=[],
)


# Silver 2025 — the same caps, but no buffer system at all, so a cap is a hard
# ceiling. Kept as its own fixture because "over the cap" and "over the cap by
# more than the team can afford" are different rules and deserve separate tests.
SILVER_2025 = SILVER.replace(buffer_per_line=D("0"), buffer_total=D("0"))


def player(name: str, utr: str, gender: str = "M") -> Candidate:
    return Candidate(key=name, name=name, gender=gender, match_utr=D(utr))


def lineup(**pairs) -> dict[str, tuple[Candidate, Candidate]]:
    """A full lineup keyed by line code. Defaults keep every line legal so a
    test can disturb exactly one thing."""
    base = {
        "D1": (player("a", "6.50"), player("b", "6.50")),
        "D2": (player("c", "6.00"), player("d", "6.00")),
        "D3": (player("e", "5.50"), player("f", "5.50")),
        "MD": (player("g", "5.00"), player("h", "5.00", "F")),
        "WD": (player("i", "4.50", "F"), player("j", "4.50", "F")),
    }
    base.update(pairs)
    return base


def codes(report) -> set[str]:
    return {v.code for v in report.violations}


class TestLineCap:
    """Under 2025 rules, where there is no buffer to absorb anything."""

    def test_a_pair_over_its_line_cap_is_a_violation(self):
        report = check_lineup(
            SILVER_2025, lineup(D2=(player("c", "7.00"), player("d", "6.00")))
        )

        assert not report.is_legal
        assert "line_cap" in codes(report)

    def test_a_pair_exactly_on_the_cap_is_legal(self):
        # The boundary is the whole point: a float would round 6.00 + 6.00 into
        # something that is not 12.00 and reject a legal lineup.
        report = check_lineup(
            SILVER_2025, lineup(D2=(player("c", "6.00"), player("d", "6.00")))
        )

        assert report.is_legal, report.violations

    def test_a_cap_violation_names_its_line_and_the_overage(self):
        report = check_lineup(
            SILVER_2025, lineup(D3=(player("e", "6.00"), player("f", "5.25")))
        )

        violation = next(v for v in report.violations if v.code == "line_cap")
        assert violation.line == "D3"
        assert violation.amount == D("0.25")

    def test_the_cap_is_read_from_the_rules_not_hardcoded(self):
        # The same pair is legal under a division whose D3 allows more. Caps
        # change every season, so they cannot live in the code.
        looser = SILVER_2025.replace(lines=[
            line if line.code != "D3" else LineRule("D3", "mens_doubles", D("12.00"))
            for line in SILVER_2025.lines
        ])

        pair = lineup(D3=(player("e", "6.00"), player("f", "5.25")))
        assert not check_lineup(SILVER_2025, pair).is_legal
        assert check_lineup(looser, pair).is_legal


class TestSharedBuffer:
    def test_one_line_over_within_the_team_allowance_is_legal(self):
        # 0.3 over a 0.5 allowance, nothing else over.
        report = check_lineup(
            SILVER, lineup(D2=(player("c", "6.30"), player("d", "6.00")))
        )

        assert report.is_legal, report.violations

    def test_five_lines_each_comfortably_over_still_bust_the_budget(self):
        """The rule this test exists for.

        Buffer is a budget the whole team shares, not a per-line tolerance.
        Judging each line on its own passes every one of these five — each is
        0.2 over a 0.5 per-line ceiling — while the team has spent 1.0 of an
        0.5 allowance.
        """
        report = check_lineup(SILVER, lineup(
            D1=(player("a", "6.60"), player("b", "6.60")),
            D2=(player("c", "6.10"), player("d", "6.10")),
            D3=(player("e", "5.60"), player("f", "5.60")),
            MD=(player("g", "5.30"), player("h", "5.15", "F")),
            WD=(player("i", "4.80", "F"), player("j", "4.65", "F")),
        ))

        assert not report.is_legal
        assert "buffer_total" in codes(report)

    def test_the_budget_violation_reports_the_overspend_not_a_line(self):
        report = check_lineup(SILVER, lineup(
            D1=(player("a", "6.60"), player("b", "6.60")),
            D2=(player("c", "6.10"), player("d", "6.10")),
            D3=(player("e", "5.60"), player("f", "5.60")),
            MD=(player("g", "5.30"), player("h", "5.15", "F")),
            WD=(player("i", "4.80", "F"), player("j", "4.65", "F")),
        ))

        violation = next(v for v in report.violations if v.code == "buffer_total")
        assert violation.line is None
        # 1.00 spent against 0.50 allowed.
        assert violation.amount == D("0.50")

    def test_spending_exactly_the_allowance_is_legal(self):
        # 0.5 over on one line, allowance 0.5. The boundary again.
        report = check_lineup(
            SILVER, lineup(D2=(player("c", "6.50"), player("d", "6.00")))
        )

        assert report.is_legal, report.violations

    def test_a_line_over_its_own_per_line_ceiling_is_a_violation(self):
        # 0.6 over on one line: within nothing, since the per-line ceiling is
        # 0.5 — and it busts the team budget too.
        report = check_lineup(
            SILVER, lineup(D2=(player("c", "6.60"), player("d", "6.00")))
        )

        assert not report.is_legal
        assert "buffer_per_line" in codes(report)

    def test_a_division_without_a_buffer_forbids_any_overage(self):
        # 2025 had no buffer system at all: allowance zero, so 0.01 over is over.
        report = check_lineup(
            SILVER_2025, lineup(D2=(player("c", "6.01"), player("d", "6.00")))
        )

        assert not report.is_legal


class TestPartnerGapAndOrder:
    def test_a_partner_gap_over_the_limit_is_a_violation(self):
        report = check_lineup(
            SILVER, lineup(D3=(player("e", "7.00"), player("f", "3.40")))
        )

        assert not report.is_legal
        assert "partner_gap" in codes(report)

    def test_a_gap_exactly_on_the_limit_is_legal(self):
        report = check_lineup(
            SILVER, lineup(D3=(player("e", "6.75"), player("f", "3.25")))
        )

        assert report.is_legal, report.violations

    def test_mens_doubles_may_not_improve_down_the_order(self):
        # D2 stronger than D1 is the 田忌赛马 the rule forbids.
        report = check_lineup(SILVER, lineup(
            D1=(player("a", "5.50"), player("b", "5.50")),
            D2=(player("c", "6.00"), player("d", "6.00")),
        ))

        assert not report.is_legal
        assert "mens_doubles_order" in codes(report)

    def test_two_mens_doubles_lines_may_tie(self):
        # Equal is not an inversion — two lines can land on the same total,
        # which happens routinely when both are pushed against their caps.
        report = check_lineup(SILVER, lineup(
            D1=(player("a", "5.50"), player("b", "5.50")),
            D2=(player("c", "5.50"), player("d", "5.50")),
            D3=(player("e", "5.00"), player("f", "5.00")),
        ))

        assert report.is_legal, report.violations

    def test_the_order_violation_names_the_lines_and_the_inversion(self):
        report = check_lineup(SILVER, lineup(
            D2=(player("c", "5.00"), player("d", "5.00")),
            D3=(player("e", "5.50"), player("f", "5.50")),
        ))

        violation = next(v for v in report.violations if v.code == "mens_doubles_order")
        assert violation.line == "D3"
        assert violation.amount == D("1.00")


class TestOpenLines:
    # Gold: D1 and MD have no ceiling at all.
    GOLD = RuleSet(
        lines=[
            LineRule("D1", "mens_doubles", None),
            LineRule("D2", "mens_doubles", D("15.00")),
            LineRule("D3", "mens_doubles", D("13.00")),
            LineRule("MD", "mixed_doubles", None),
            LineRule("WD", "womens_doubles", D("11.00")),
        ],
        buffer_per_line=D("0.3"),
        buffer_total=D("0.3"),
        partner_gap_max=D("3.50"),
        limits=[],
    )

    def gold_lineup(self, **pairs):
        base = {
            "D1": (player("a", "9.00"), player("b", "8.50")),
            "D2": (player("c", "7.50"), player("d", "7.50")),
            "D3": (player("e", "6.50"), player("f", "6.50")),
            "MD": (player("g", "8.00"), player("h", "7.00", "F")),
            "WD": (player("i", "5.50", "F"), player("j", "5.50", "F")),
        }
        base.update(pairs)
        return base

    def test_an_open_line_has_no_ceiling(self):
        report = check_lineup(
            self.GOLD, self.gold_lineup(D1=(player("a", "12.00"), player("b", "11.00")))
        )

        assert report.is_legal, report.violations

    def test_an_open_line_spends_no_buffer(self):
        """A huge open line must not eat the budget the capped lines share.

        Treating an open line as cap=∞ would make its overage zero anyway, but
        treating it as a very large cap would not — and would quietly change
        what the capped lines can afford.
        """
        report = check_lineup(self.GOLD, self.gold_lineup(
            D1=(player("a", "12.00"), player("b", "11.00")),
            D2=(player("c", "7.65"), player("d", "7.50")),  # 0.15 over
            D3=(player("e", "6.60"), player("f", "6.55")),  # 0.15 over
        ))

        assert report.is_legal, report.violations

    def test_an_open_line_still_obeys_the_partner_gap(self):
        report = check_lineup(
            self.GOLD, self.gold_lineup(D1=(player("a", "12.00"), player("b", "8.00")))
        )

        assert not report.is_legal
        assert "partner_gap" in codes(report)


class TestEligibilityLimits:
    # Silver: at most one man over 7.0 and one woman over 5.5, any line.
    SILVER_LIMITS = SILVER.replace(limits=[
        EligibilityLimit("M", D("7.0"), 1, None),
        EligibilityLimit("F", D("5.5"), 1, None),
    ])
    # Gold: the man over 9.0 may only appear on D1 or MD — and in gold those
    # two are open lines, which is the only place such a player fits at all.
    GOLD_LIMITS = RuleSet(
        lines=[
            LineRule("D1", "mens_doubles", None),
            LineRule("D2", "mens_doubles", D("15.00")),
            LineRule("D3", "mens_doubles", D("13.00")),
            LineRule("MD", "mixed_doubles", None),
            LineRule("WD", "womens_doubles", D("11.00")),
        ],
        buffer_per_line=D("0.3"),
        buffer_total=D("0.3"),
        partner_gap_max=D("3.50"),
        limits=[EligibilityLimit("M", D("9.0"), 1, ("D1", "MD"))],
    )

    def test_too_many_high_utr_men_is_a_violation(self):
        report = check_lineup(self.SILVER_LIMITS, lineup(
            D1=(player("a", "7.50"), player("b", "5.50")),
            D2=(player("c", "7.20"), player("d", "4.80")),
        ))

        assert not report.is_legal
        assert "eligibility_count" in codes(report)

    def test_exactly_the_allowed_number_is_legal(self):
        report = check_lineup(self.SILVER_LIMITS, lineup(
            D1=(player("a", "7.50"), player("b", "5.50")),
        ))

        assert report.is_legal, report.violations

    def test_a_player_exactly_on_the_threshold_does_not_count(self):
        # The rule says "above 7.0", so 7.00 itself is not above it.
        report = check_lineup(self.SILVER_LIMITS, lineup(
            D1=(player("a", "7.00"), player("b", "6.00")),
            D2=(player("c", "7.00"), player("d", "5.00")),
        ))

        assert report.is_legal, report.violations

    def test_the_line_restriction_is_checked_as_well_as_the_count(self):
        """Counting alone is not the rule.

        One man over 9.0 is allowed, but only on D1 or MD. Checking the count
        and stopping would pass this lineup, which puts him on D2.
        """
        report = check_lineup(self.GOLD_LIMITS, lineup(
            D2=(player("c", "9.50"), player("d", "6.10")),
        ))

        assert not report.is_legal
        assert "eligibility_line" in codes(report)
        # And the count alone is satisfied — one such player is allowed.
        assert "eligibility_count" not in codes(report)

    def test_the_same_player_on_an_allowed_line_is_legal(self):
        report = check_lineup(self.GOLD_LIMITS, lineup(
            D1=(player("a", "9.50"), player("b", "6.10")),
            D2=(player("c", "6.00"), player("d", "6.00")),
        ))

        assert report.is_legal, report.violations

    def test_an_unrestricted_limit_allows_any_line(self):
        # restricted_to_lines of None means "any line" — not "no line".
        report = check_lineup(self.SILVER_LIMITS, lineup(
            D2=(player("c", "7.50"), player("d", "4.50")),
        ))

        assert report.is_legal, report.violations

    def test_a_woman_on_a_mens_line_is_judged_by_the_mens_limit(self):
        """Women may fill men's slots, and then the men's limit applies.

        Judging her by the women's threshold would let a second player past
        the men's cap on court.
        """
        report = check_lineup(self.SILVER_LIMITS, lineup(
            D1=(player("a", "7.50"), player("b", "5.50")),
            D2=(player("c", "7.20", "F"), player("d", "4.80")),
        ))

        assert not report.is_legal
        assert "eligibility_count" in codes(report)

    def test_the_womens_limit_is_counted_separately(self):
        report = check_lineup(self.SILVER_LIMITS, lineup(
            MD=(player("g", "4.40"), player("h", "5.80", "F")),
            WD=(player("i", "5.70", "F"), player("j", "3.50", "F")),
        ))

        assert not report.is_legal
        assert "eligibility_count" in codes(report)


class TestDistinctPlayers:
    def test_a_player_on_two_lines_is_a_violation(self):
        twice = player("a", "6.00")
        report = check_lineup(SILVER, lineup(
            D2=(twice, player("d", "6.00")),
            D3=(twice, player("f", "5.00")),
        ))

        assert not report.is_legal
        assert "duplicate_player" in codes(report)

    def test_the_duplicate_violation_names_the_player(self):
        twice = player("a", "6.00")
        report = check_lineup(SILVER, lineup(
            D2=(twice, player("d", "6.00")),
            D3=(twice, player("f", "5.00")),
        ))

        violation = next(v for v in report.violations if v.code == "duplicate_player")
        assert "a" in violation.message


class TestEveryViolationIsActionable:
    def test_each_violation_names_a_line_or_is_lineup_wide(self):
        report = check_lineup(SILVER, lineup(
            D1=(player("a", "5.00"), player("b", "5.00")),
            D2=(player("c", "7.60"), player("d", "4.00")),
        ))

        assert report.violations
        for violation in report.violations:
            assert violation.message
            # Lineup-wide rules carry no line; every other one must say where.
            assert violation.line is not None or violation.code == "buffer_total"
