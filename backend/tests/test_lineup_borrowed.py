"""Engine-level borrowed on-court cap: a lineup with more borrowed players on
court than on_court_cap is not a legal candidate; when the cap is what makes the
team infeasible, the result says so via borrowed_over_limit."""

from decimal import Decimal as D

from app.lineups.rules import Candidate, LineRule, RuleSet
from app.lineups.search import search_lineups

RULES = RuleSet(
    lines=[
        LineRule("D1", "mens_doubles", D("13.00")),
        LineRule("D2", "mens_doubles", D("12.00")),
        LineRule("D3", "mens_doubles", D("11.00")),
        LineRule("MD", "mixed_doubles", D("10.25")),
        LineRule("WD", "womens_doubles", D("9.25")),
    ],
    buffer_per_line=D("0.50"),
    buffer_total=D("0.50"),
    partner_gap_max=D("3.50"),
)


def _roster(borrowed_keys=()):
    # Exactly ten eligible players → one squad. m1,m2 can be marked borrowed.
    men = [("m1", "6.00"), ("m2", "5.90"), ("m3", "5.80"), ("m4", "5.70"),
           ("m5", "5.60"), ("m6", "5.50"), ("m7", "5.40")]
    women = [("w1", "4.60"), ("w2", "4.50"), ("w3", "4.40")]
    return (
        [Candidate(k, k, "M", D(v), k in borrowed_keys) for k, v in men]
        + [Candidate(k, k, "F", D(v), k in borrowed_keys) for k, v in women]
    )


def test_no_cap_means_not_checked():
    result = search_lineups(RULES, _roster(borrowed_keys={"m1", "m2"}))
    assert result.borrowed_players_checked is False
    assert len(result.candidates) == 1  # the single squad, borrowed not enforced


def test_over_cap_lineup_is_rejected_and_reported():
    # The only squad puts two borrowed players on court; cap of 1 forbids it.
    result = search_lineups(
        RULES, _roster(borrowed_keys={"m1", "m2"}), borrowed_cap=1
    )
    assert result.borrowed_players_checked is True
    assert result.candidates == []
    assert result.borrowed_over_limit is not None
    assert result.borrowed_over_limit.on_court == 2
    assert result.borrowed_over_limit.cap == 1
    assert set(result.borrowed_over_limit.names) == {"m1", "m2"}


def test_within_cap_is_allowed():
    result = search_lineups(
        RULES, _roster(borrowed_keys={"m1", "m2"}), borrowed_cap=2
    )
    assert result.borrowed_players_checked is True
    assert len(result.candidates) == 1
    assert result.borrowed_over_limit is None
