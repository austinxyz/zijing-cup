"""What the search says when it cannot answer, or could not finish.

Three states that must never be expressed as an empty list: no solution
exists, the search ran out of budget, and the borrowed-player rule was not
checked at all.

All names are invented.
"""

from decimal import Decimal

import pytest

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet
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
    men = [("m1", "6.80"), ("m2", "6.40"), ("m3", "6.00"), ("m4", "5.80"),
           ("m5", "5.60"), ("m6", "5.40"), ("m7", "5.20"), ("m8", "5.00")]
    women = [("w1", "5.00"), ("w2", "4.80"), ("w3", "4.60"), ("w4", "4.40")]
    return ([Candidate(k, k, "M", D(v)) for k, v in men]
            + [Candidate(k, k, "F", D(v)) for k, v in women])


def find(key: str) -> Candidate:
    return next(p for p in roster() if p.key == key)


class TestNoSolution:
    def starve_womens_doubles(self):
        """Four women: two locked onto other lines, one excluded. Women's
        doubles needs two and has one left."""
        return dict(
            locks={"MD": (find("m1"), find("w1")), "D3": (find("m5"), find("w2"))},
            excluded=["w3"],
        )

    def test_it_says_no_solution_rather_than_returning_nothing(self):
        result = search_lineups(SILVER, roster(), **self.starve_womens_doubles())

        assert result.infeasible_line == "WD"
        assert not result.candidates

    def test_an_ordinary_empty_result_is_not_reported_as_infeasible(self):
        # A search that simply found nothing worth keeping is a different
        # statement from one whose constraints admit no lineup at all.
        result = search_lineups(SILVER, roster())

        assert result.infeasible_line is None
        assert result.candidates

    def test_it_reports_where_the_scarce_players_went(self):
        """Read straight off the locks and exclusions — no second search.

        This is what turns "WD has no pair" into something a captain can act
        on, and it costs nothing because it is the input restated.
        """
        result = search_lineups(SILVER, roster(), **self.starve_womens_doubles())

        assert result.placements["w1"] == "MD"
        assert result.placements["w2"] == "D3"
        assert result.placements["w3"] == "excluded"
        assert "w4" not in result.placements  # still available

    def test_it_does_not_claim_to_know_which_lock_is_to_blame(self):
        # Attributing blame would need a full search per lock, and would still
        # be wrong when several locks combine to starve a line.
        result = search_lineups(SILVER, roster(), **self.starve_womens_doubles())

        assert not hasattr(result, "blamed_lock")


class TestTruncation:
    def test_a_tiny_budget_reports_an_incomplete_search(self):
        result = search_lineups(SILVER, roster(), node_budget=50)

        assert result.truncated

    def test_a_search_that_finishes_says_so(self):
        result = search_lineups(SILVER, roster(), node_budget=10_000_000)

        assert not result.truncated

    def test_truncation_does_not_invent_infeasibility(self):
        # Running out of budget means "we did not finish", not "there is no
        # answer" — conflating them would send a captain unpicking locks that
        # were never the problem.
        result = search_lineups(SILVER, roster(), node_budget=50)

        assert result.infeasible_line is None


class TestBorrowedPlayers:
    def test_every_result_states_that_borrowed_players_were_not_checked(self):
        """Unconditional. The per-match ceiling depends on how many schools a
        team combines, which is not in the system, so silence here would read
        as "checked and fine"."""
        assert not search_lineups(SILVER, roster()).borrowed_players_checked

    def test_it_says_so_even_when_there_is_no_solution(self):
        result = search_lineups(
            SILVER, roster(),
            locks={"MD": (find("m1"), find("w1")), "D3": (find("m5"), find("w2"))},
            excluded=["w3"],
        )

        assert not result.borrowed_players_checked
