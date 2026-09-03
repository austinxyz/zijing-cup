"""Single-seat pin: fix one player to a line, engine fills the partner.

Small invented rosters so the expected placement is worked out by hand.
"""

from decimal import Decimal

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
    return (
        [Candidate(k, k, "M", D(v)) for k, v in men]
        + [Candidate(k, k, "F", D(v)) for k, v in women]
    )


def _by_key(rs):
    return {c.key: c for c in rs}


def _line_keys(candidate, code):
    return {p.key for p in candidate.lines[code]}


class TestPinSingleLine:
    def test_pinned_player_lands_on_that_line_with_a_partner(self):
        rs = roster()
        pin = _by_key(rs)["m3"]
        result = search_lineups(SILVER, rs, pins={"MD": pin})

        assert result.infeasible_line is None
        assert result.candidates, "expected at least one legal lineup"
        top = result.candidates[0]
        # m3 is on MD, with a partner (mixed → the partner is a woman).
        assert "m3" in _line_keys(top, "MD")
        partners = [p for p in top.lines["MD"] if p.key != "m3"]
        assert len(partners) == 1 and partners[0].gender == "F"
        # m3 appears on no other line.
        for code in ("D1", "D2", "D3", "WD"):
            assert "m3" not in _line_keys(top, code)

    def test_multiple_pins_are_jointly_satisfied(self):
        rs = roster()
        by = _by_key(rs)
        result = search_lineups(SILVER, rs, pins={"MD": by["m3"], "WD": by["w1"]})

        assert result.infeasible_line is None
        assert result.candidates
        top = result.candidates[0]
        assert "m3" in _line_keys(top, "MD")
        assert "w1" in _line_keys(top, "WD")
        # each pin only on its own line
        assert "m3" not in _line_keys(top, "WD")
        for code in ("D1", "D2", "D3", "MD"):
            assert "w1" not in _line_keys(top, code)


def _reasons(result):
    return result.infeasibility.reasons if result.infeasibility else []


class TestPinInfeasibleDiagnosis:
    def test_pin_with_no_legal_partner_diagnoses_within_pinned_pairs(self):
        # Pin m1 (6.80) to MD (mixed, cap 10.25 + buffer 0.5 = 10.75). MD needs
        # a woman partner; every woman (top is w1 5.00) pushes m1+her over cap
        # (m1+w1 = 11.80). Without the pin MD has legal pairs (m8+w4 = 9.40), so
        # a pin-blind diagnosis would wrongly report the line as fine.
        rs = roster()
        pin = _by_key(rs)["m1"]
        result = search_lineups(SILVER, rs, pins={"MD": pin})

        assert result.infeasible_line == "MD"
        kinds = {r.kind for r in _reasons(result)}
        assert "over_cap" in kinds
        # names the pinned player and the line, scoped to pin-pairs
        over = [r for r in _reasons(result) if r.kind == "over_cap"][0]
        assert "m1" in over.message
        # not a bogus "本可行" gender_shortage from the pin-blind pool
        assert "gender_shortage" not in kinds


class TestPinGender:
    def test_a_woman_can_be_pinned_to_a_mens_line(self):
        # Women may fill men's-doubles slots; a woman pinned to D1 gets a legal
        # men's-doubles partner from the engine.
        rs = roster()
        pin = _by_key(rs)["w1"]
        result = search_lineups(SILVER, rs, pins={"D1": pin})

        assert result.infeasible_line is None
        assert result.candidates
        top = result.candidates[0]
        assert "w1" in _line_keys(top, "D1")
        assert len(top.lines["D1"]) == 2
