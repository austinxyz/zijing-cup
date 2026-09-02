"""Structured diagnosis of why an infeasible line has no legal pair.

Small invented rosters so the empty line and the reason are worked out by hand.
Covers the four objective reasons (gender shortage / all over cap / all over
gap / eligibility) and attribution to the user's own excludes and locks.
"""

from decimal import Decimal

from app.lineups.rules import (
    Candidate,
    EligibilityLimit,
    LineRule,
    RuleSet,
)
from app.lineups.search import diagnose_line, search_lineups

D = Decimal

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
    limits=[EligibilityLimit("M", D("7.0"), 1, None)],
)


def _men(*utrs: str) -> list[Candidate]:
    return [Candidate(f"m{i}", f"m{i}", "M", D(v)) for i, v in enumerate(utrs, 1)]


def _women(*utrs: str) -> list[Candidate]:
    return [Candidate(f"w{i}", f"w{i}", "F", D(v)) for i, v in enumerate(utrs, 1)]


def _reasons(result):
    return result.infeasibility.reasons if result.infeasibility else []


def _kinds(result):
    return {r.kind for r in _reasons(result)}


class TestGenderShortage:
    def test_womens_doubles_short_on_women_gives_a_reason(self):
        # Eight men, one woman: WD needs two women and has one.
        roster = _men("6.8", "6.4", "6.0", "5.8", "5.6", "5.4", "5.2", "5.0") + _women("5.0")
        result = search_lineups(SILVER, roster)

        assert result.infeasible_line == "WD"
        assert result.infeasibility is not None
        assert result.infeasibility.line == "WD"
        shortage = [r for r in _reasons(result) if r.kind == "gender_shortage"]
        assert len(shortage) == 1
        assert "需要 2" in shortage[0].message
        assert "1" in shortage[0].message


class TestOverCap:
    def test_all_pairs_over_cap_gives_over_cap_reason(self):
        # WD cap 9.25 + buffer 0.5 = 9.75; two 5.50 women sum to 11.00, over.
        # Enough women that gender is not the reason; a light man keeps MD legal.
        roster = _men("5.0", "5.0", "5.0", "5.0", "5.0", "5.0") + _women("5.5", "5.5")
        result = search_lineups(SILVER, roster)

        assert result.infeasible_line == "WD"
        assert _kinds(result) == {"over_cap"}
        over = [r for r in _reasons(result) if r.kind == "over_cap"][0]
        assert "9.25" in over.message
        assert over.attributed == []


class TestOverGap:
    def test_all_pairs_over_gap_gives_over_gap_reason(self):
        # Two women 8.00 and 4.00 differ by 4.00 > partner_gap_max 3.50; the
        # only WD pair fails on gap (checked before cap). A light woman keeps
        # MD legal.
        roster = _men("5.0", "5.0", "5.0", "5.0", "5.0", "5.0") + _women("8.0", "4.0")
        result = search_lineups(SILVER, roster)

        assert result.infeasible_line == "WD"
        assert _kinds(result) == {"over_gap"}
        gap = [r for r in _reasons(result) if r.kind == "over_gap"][0]
        assert "3.50" in gap.message
        assert gap.attributed == []


# Men above 6.0 may only play D1 or MD. On D2 every such man is ineligible.
RESTRICTED = RuleSet(
    lines=[
        LineRule("D1", "mens_doubles", D("13.00")),
        LineRule("D2", "mens_doubles", D("12.00")),
        LineRule("MD", "mixed_doubles", D("10.25")),
        LineRule("WD", "womens_doubles", D("9.25")),
    ],
    buffer_per_line=D("0.5"),
    buffer_total=D("0.5"),
    partner_gap_max=D("3.50"),
    limits=[EligibilityLimit("M", D("6.0"), 10, ["D1", "MD"])],
)


class TestEligibility:
    def test_restricted_line_gives_eligibility_reason_not_user_blame(self):
        # Every player is 6.2 (> 6.0). On D2 (not in D1/MD) each is restricted:
        # men directly, women because they count as men's-slot fillers. So no
        # legal D2 pair survives, on eligibility, after gap and cap pass. D1 is
        # a permitted line for them, so D1 stays legal and D2 is the answer.
        roster = _men("6.2", "6.2", "6.2", "6.2") + _women("6.2", "6.2")
        result = search_lineups(RESTRICTED, roster)

        assert result.infeasible_line == "D2"
        assert "eligibility" in _kinds(result)
        elig = [r for r in _reasons(result) if r.kind == "eligibility"][0]
        assert "只能打" in elig.message
        assert elig.attributed == []


class TestAttribution:
    def test_shortage_names_excluded_and_locked_women(self):
        men = _men("6.8", "6.4", "6.0", "5.8", "5.6", "5.4", "5.2", "5.0")
        women = _women("5.0", "4.8", "4.6", "4.4")  # w1..w4
        roster = men + women
        w3 = women[2]
        m8 = men[7]
        # Exclude w1, w2; lock w3 into MD (legal: 5.0+4.6 within MD cap).
        # WD is left with w4 alone — one woman, needs two.
        result = search_lineups(
            SILVER, roster, locks={"MD": (m8, w3)}, excluded=["w1", "w2"]
        )

        assert result.infeasible_line == "WD"
        shortage = [r for r in _reasons(result) if r.kind == "gender_shortage"][0]
        by_name = {p.name: p.where for p in shortage.attributed}
        assert by_name == {"w1": "excluded", "w2": "excluded", "w3": "MD"}


class TestNoFabricatedAttribution:
    def test_over_cap_not_user_caused_has_no_attribution(self):
        # No excludes, no locks: the women are simply too strong for the WD cap.
        # The reason is stated; nobody is named as having caused it.
        roster = _men("5.0", "5.0", "5.0", "5.0", "5.0", "5.0") + _women("5.5", "5.5")
        result = search_lineups(SILVER, roster)

        assert result.placements == {}
        over = [r for r in _reasons(result) if r.kind == "over_cap"][0]
        assert over.attributed == []

    def test_diagnose_line_is_a_standalone_pool_read(self):
        # diagnose_line takes a pool and placements and returns reasons without
        # running the branch-and-bound search — a read, not a second solve.
        wd = SILVER.lines[4]
        assert wd.code == "WD"
        available = _women("5.0")  # one woman: WD needs two
        reasons = diagnose_line(SILVER, wd, available, {}, {"w1": "w1"}, {"w1": "F"})
        assert {r.kind for r in reasons} == {"gender_shortage"}
