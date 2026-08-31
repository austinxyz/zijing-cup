"""The participation-UTR derivation chain.

Pure functions only — no session, no database. The chain is the committee's
own algorithm (Rated uses the current value, Projected falls back to last
year's override), so both the roster page and the lineup engine call it and
must get the same number for the same player.
"""

from __future__ import annotations

from decimal import Decimal

from app.players.utr_chain import SeasonUtrView, resolve_match_utr


def season(year: int, value: str, *, unresolved: bool = False) -> SeasonUtrView:
    return SeasonUtrView(
        season_year=year, value=Decimal(value), is_unresolved=unresolved
    )


def test_frozen_value_wins_without_deriving() -> None:
    resolved = resolve_match_utr(
        season_utrs=[season(2026, "6.42"), season(2025, "6.10")],
        current_doubles=Decimal("7.00"),
        current_doubles_status="rated",
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("6.42")
    assert resolved.origin == "frozen"
    assert resolved.origin_year == 2026


def test_current_rated_doubles_stands_in_when_the_season_is_missing() -> None:
    resolved = resolve_match_utr(
        season_utrs=[season(2025, "6.10")],
        current_doubles=Decimal("7.00"),
        current_doubles_status="rated",
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("7.00")
    assert resolved.origin == "current_doubles"
    # Not a season value, so there is no year to name.
    assert resolved.origin_year is None


def test_projected_current_value_sends_us_back_to_the_last_season_with_a_value() -> None:
    resolved = resolve_match_utr(
        season_utrs=[season(2025, "6.10")],
        current_doubles=Decimal("7.00"),
        current_doubles_status="projected",
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("6.10")
    assert resolved.origin == "prior_season"
    assert resolved.origin_year == 2025


def test_the_fallback_reaches_further_back_than_one_year() -> None:
    # 2026 and 2025 both absent; the most recent season that has a value is
    # 2024. "Last year" would find nothing and drop the player.
    resolved = resolve_match_utr(
        season_utrs=[season(2024, "5.80"), season(2023, "5.20")],
        current_doubles=None,
        current_doubles_status=None,
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("5.80")
    assert resolved.origin == "prior_season"
    assert resolved.origin_year == 2024


def test_nothing_to_derive_from_returns_none() -> None:
    resolved = resolve_match_utr(
        season_utrs=[],
        current_doubles=None,
        current_doubles_status=None,
        season_year=2026,
    )

    assert resolved is None


def test_an_unrated_current_value_is_not_trusted_and_history_is_used() -> None:
    # The player has a current doubles number, but it is unrated: the chain
    # skips step two and reads the last season that was actually frozen.
    resolved = resolve_match_utr(
        season_utrs=[season(2025, "6.10")],
        current_doubles=Decimal("7.00"),
        current_doubles_status="unrated",
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("6.10")
    assert resolved.origin == "prior_season"


def test_an_unresolved_season_value_is_used_and_flagged() -> None:
    # `value` already holds the larger of the two candidates. Taking the
    # larger one is the safe direction — the participation UTR is a ceiling,
    # so the smaller would present an illegal lineup as legal — but the
    # caller has to be able to say the number is not settled.
    resolved = resolve_match_utr(
        season_utrs=[season(2026, "6.98", unresolved=True)],
        current_doubles=None,
        current_doubles_status=None,
        season_year=2026,
    )

    assert resolved is not None
    assert resolved.value == Decimal("6.98")
    assert resolved.is_unresolved is True
