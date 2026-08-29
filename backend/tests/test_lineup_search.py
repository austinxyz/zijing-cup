"""Searching for legal lineups under locks and exclusions.

Pure functions, no database. The rosters here are small and invented so the
expected answers can be worked out by hand.
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
import app.lineups.search as search_module
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


class TestCeilingReport:
    def test_the_ceiling_is_the_best_total_returned(self):
        result = search_lineups(SILVER, roster())

        assert result.ceiling == max(totals(result))

    def test_the_ceiling_itself_does_not_depend_on_how_many_we_keep(self):
        few = search_lineups(SILVER, roster(), keep=1)
        many = search_lineups(SILVER, roster(), keep=50)

        assert few.ceiling == many.ceiling

    def test_a_roster_with_exactly_ten_eligible_players_has_one_squad(self):
        # Seven men and three women — the minimum that can field anything at
        # all, since the court needs two women for WD and one more for MD.
        # Everyone plays, so however the slots are shuffled it is one squad.
        ten = [
            Candidate(f"m{i}", f"m{i}", "M", D(v))
            for i, v in enumerate(
                ["6.00", "5.90", "5.80", "5.70", "5.60", "5.50", "5.40"], 1
            )
        ] + [
            Candidate("w1", "w1", "F", D("4.60")),
            Candidate("w2", "w2", "F", D("4.40")),
            Candidate("w3", "w3", "F", D("4.20")),
        ]

        result = search_lineups(SILVER, ten)

        assert result.candidates
        assert result.squads_at_ceiling == 1


class TestCeilingCountUnderHeavyTies:
    """A roster where everything ties, which is the normal case in practice.

    Eight men on 5.00 and four women on 4.60. Every squad of seven men and
    three women totals 48.80, so the ceiling has 8 × 4 = 32 distinct squads —
    one man and one woman sit out, and it makes no difference which.
    """

    def flat_roster(self) -> list[Candidate]:
        return (
            [Candidate(f"m{i}", f"m{i}", "M", D("5.00")) for i in range(1, 9)]
            + [Candidate(f"w{i}", f"w{i}", "F", D("4.60")) for i in range(1, 5)]
        )

    def test_the_ceiling_is_still_found_exactly(self):
        # Whatever happens to the count, the ceiling itself is not in doubt.
        result = search_lineups(SILVER, self.flat_roster(), keep=20)

        assert result.ceiling == D("48.80")

    def test_a_pruned_count_says_it_is_a_lower_bound(self):
        """Counting every tie exactly is ruinous on a tie-heavy roster.

        A roster where every player has the same rating is the extreme case:
        the only way to count all 32 tied squads is to prune nothing, which is
        the search this design exists to avoid. Rather than pay that on every
        search or quietly understate the answer, the search says whether the
        number it reports is the whole truth — so a caller can show "1 组" with
        confidence and "至少 N 组" where that is all it knows.
        """
        result = search_lineups(SILVER, self.flat_roster(), keep=3)

        assert not result.squads_at_ceiling_exact
        assert 0 < result.squads_at_ceiling <= 32

    def test_a_roster_without_heavy_ties_is_counted_exactly(self):
        result = search_lineups(SILVER, roster(), keep=20)

        assert result.squads_at_ceiling_exact
        assert result.squads_at_ceiling >= 1


class TestPruningStaysCheap:
    def test_the_search_gives_up_on_a_line_once_its_pairs_cannot_help(self):
        """The pairs on each line are sorted strongest first, so once one of
        them cannot beat the incumbent, none of the weaker ones can either.

        Testing each pair in turn instead of abandoning the rest took 20s on
        the real 26-player roster that ties most heavily, against 0.7s with the
        list abandoned — the same answers either way, twenty times the work.
        This counts the pairs actually examined, because a wall-clock assertion
        would be flaky and would not say what went wrong.
        """
        examined = 0
        original = search_module.pair_total

        def counting_pair_total(pair):
            nonlocal examined
            examined += 1
            return original(pair)

        search_module.pair_total = counting_pair_total
        try:
            search_lineups(SILVER, roster(), keep=5)
        finally:
            search_module.pair_total = original

        # Measured: 9,836 with the list abandoned, 25,536 without, on this
        # twelve-player roster. The gap widens with roster size — twenty times
        # the work on the real 26-player one.
        assert examined < 15_000, examined


class TestLocksAndExclusions:
    def lock(self):
        pool = {p.key: p for p in roster()}
        return {"D2": (pool["m3"], pool["m6"])}

    def test_every_result_contains_the_locked_pair(self):
        result = search_lineups(SILVER, roster(), locks=self.lock())

        assert result.candidates
        for candidate in result.candidates:
            assert {p.key for p in candidate.lines["D2"]} == {"m3", "m6"}

    def test_an_excluded_player_appears_nowhere(self):
        result = search_lineups(SILVER, roster(), excluded=["m1", "w1"])

        assert result.candidates
        for candidate in result.candidates:
            assert not {"m1", "w1"} & candidate.squad

    def test_locking_cannot_raise_the_ceiling(self):
        # A lock removes freedom; it can only cost strength or leave it alone.
        free = search_lineups(SILVER, roster())
        locked = search_lineups(SILVER, roster(), locks=self.lock())

        assert locked.ceiling <= free.ceiling

    def test_excluding_a_player_cannot_raise_the_ceiling(self):
        free = search_lineups(SILVER, roster())
        fewer = search_lineups(SILVER, roster(), excluded=["m1"])

        assert fewer.ceiling <= free.ceiling


class TestDeterminism:
    def test_two_identical_searches_return_the_same_order(self):
        """Ties are the norm here, so the order among them must be decided by
        something stable.

        Without that the list reshuffles between identical searches, and a
        captain who reloads sees a different set of recommendations for no
        reason — which reads as the page being broken.
        """
        first = search_lineups(SILVER, roster(), keep=10)
        second = search_lineups(SILVER, roster(), keep=10)

        assert [c.total for c in first.candidates] == [c.total for c in second.candidates]
        assert [sorted(c.squad) for c in first.candidates] == [
            sorted(c.squad) for c in second.candidates
        ]

    def test_the_input_order_of_the_roster_does_not_change_the_answer(self):
        forward = search_lineups(SILVER, roster(), keep=10)
        backward = search_lineups(SILVER, list(reversed(roster())), keep=10)

        assert forward.ceiling == backward.ceiling
        assert [sorted(c.squad) for c in forward.candidates] == [
            sorted(c.squad) for c in backward.candidates
        ]


class TestDedupeAndOrderUnderTies:
    """The flat roster is where these two properties actually bite: every
    squad ties, and each squad can be arranged across the lines many ways."""

    def flat(self) -> list[Candidate]:
        return (
            [Candidate(f"m{i}", f"m{i}", "M", D("5.00")) for i in range(1, 9)]
            + [Candidate(f"w{i}", f"w{i}", "F", D("4.60")) for i in range(1, 5)]
        )

    def test_the_same_ten_never_appear_twice(self):
        # Without deduping, one squad shuffled between lines fills the list and
        # reads as several options when it is one.
        result = search_lineups(SILVER, self.flat(), keep=60)

        squads = [c.squad for c in result.candidates]
        assert len(squads) == len(set(squads))
        assert len(squads) > 1  # not vacuous: there really are several

    def test_the_order_survives_reordering_the_roster(self):
        forward = search_lineups(SILVER, self.flat(), keep=20)
        backward = search_lineups(SILVER, list(reversed(self.flat())), keep=20)

        assert [sorted(c.squad) for c in forward.candidates] == [
            sorted(c.squad) for c in backward.candidates
        ]


class TestInvalidLocks:
    """A lock the rules do not permit must be named as such.

    Locked pairs bypass the per-line pair filter — that is what makes a lock a
    lock — so nothing downstream re-checks the slot's gender or the partner
    gap. Left unvalidated, locking two men onto women's doubles yields a
    "legal" candidate that is not, and locking an over-cap pair yields an empty
    list that reads as "your roster cannot do it" when the truth is "you asked
    for something the rules forbid".
    """

    def pool(self):
        return {p.key: p for p in roster()}

    def test_two_men_locked_onto_womens_doubles_is_rejected(self):
        # Deliberately weak enough to sit inside the women's doubles cap, so
        # the only thing wrong with them is that they are men. A stronger pair
        # would be caught by the cap and prove nothing about the slot rule.
        light = [Candidate("q1", "q1", "M", D("4.60")),
                 Candidate("q2", "q2", "M", D("4.40"))]
        result = search_lineups(
            SILVER, roster() + light, locks={"WD": (light[0], light[1])}
        )

        assert result.invalid_locks
        assert result.invalid_locks[0].code == "slot_composition"
        assert result.invalid_locks[0].line == "WD"
        assert not result.candidates

    def test_two_men_locked_onto_mixed_doubles_is_rejected(self):
        p = self.pool()
        result = search_lineups(SILVER, roster(), locks={"MD": (p["m7"], p["m8"])})

        assert any(v.code == "slot_composition" for v in result.invalid_locks)

    def test_a_player_locked_and_excluded_at_once_is_rejected(self):
        # Contradictory input, and silently honouring one of the two would
        # hide it: the lineup would come back without a player the captain
        # believes he locked in.
        p = self.pool()
        result = search_lineups(
            SILVER, roster(), locks={"D1": (p["m1"], p["m2"])}, excluded=["m1"]
        )

        assert any(v.code == "locked_but_excluded" for v in result.invalid_locks)
        assert not result.candidates

    def test_a_partner_gap_beyond_the_limit_is_rejected(self):
        p = self.pool()
        # 6.80 with 4.40 is 2.40 apart — fine. 6.80 with a 3.00 would not be,
        # so build one explicitly.
        far = Candidate("x1", "x1", "M", D("3.00"))
        result = search_lineups(
            SILVER, roster() + [far], locks={"D1": (p["m1"], far)}
        )

        assert result.invalid_locks
        assert result.invalid_locks[0].code == "partner_gap"

    def test_a_pair_beyond_cap_and_buffer_is_rejected(self):
        strong = [Candidate("y1", "y1", "M", D("9.00")),
                  Candidate("y2", "y2", "M", D("8.00"))]
        result = search_lineups(
            SILVER, roster() + strong, locks={"D3": (strong[0], strong[1])}
        )

        assert result.invalid_locks
        assert not result.candidates

    def test_locking_the_same_player_onto_two_lines_is_rejected(self):
        p = self.pool()
        result = search_lineups(SILVER, roster(), locks={
            "D1": (p["m1"], p["m2"]),
            "D2": (p["m1"], p["m3"]),
        })

        assert result.invalid_locks
        assert not result.candidates

    def test_a_legal_lock_reports_nothing(self):
        p = self.pool()
        result = search_lineups(SILVER, roster(), locks={"D2": (p["m3"], p["m6"])})

        assert not result.invalid_locks
        assert result.candidates
