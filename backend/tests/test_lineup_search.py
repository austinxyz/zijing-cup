"""Searching for legal lineups under locks and exclusions.

Pure functions, no database. The rosters here are small and invented so the
expected answers can be worked out by hand.
"""

from decimal import Decimal

import pytest

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet, check_lineup
from app.lineups.search import search_lineups

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


def roster() -> list[Candidate]:
    """Eight men and four women — enough to field a lineup several ways."""
    men = [("m1", "6.80"), ("m2", "6.40"), ("m3", "6.00"), ("m4", "5.80"),
           ("m5", "5.60"), ("m6", "5.40"), ("m7", "5.20"), ("m8", "5.00")]
    women = [("w1", "5.00"), ("w2", "4.80"), ("w3", "4.60"), ("w4", "4.40")]
    return (
        [Candidate(k, k, "M", D(v)) for k, v in men]
        + [Candidate(k, k, "F", D(v)) for k, v in women]
    )


def totals(result) -> list[Decimal]:
    return [c.total for c in result.candidates]


def squad(candidate) -> frozenset[str]:
    return frozenset(p.key for pair in candidate.lines.values() for p in pair)


class TestSearchProducesLegalLineups:
    def test_every_candidate_passes_the_full_constraint_set(self):
        result = search_lineups(SILVER, roster())

        assert result.candidates
        for candidate in result.candidates:
            report = check_lineup(SILVER, candidate.lines)
            assert report.is_legal, (candidate.total, report.violations)

    def test_every_candidate_fields_ten_distinct_players(self):
        result = search_lineups(SILVER, roster())

        for candidate in result.candidates:
            assert len(squad(candidate)) == 10

    def test_womens_doubles_is_two_women_and_mixed_is_one_of_each(self):
        result = search_lineups(SILVER, roster())

        for candidate in result.candidates:
            wd = candidate.lines["WD"]
            assert {p.gender for p in wd} == {"F"}
            md = candidate.lines["MD"]
            assert {p.gender for p in md} == {"M", "F"}
