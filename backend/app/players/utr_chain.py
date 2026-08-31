"""Which number counts as a player's participation UTR for one season.

The new registry lets a player be on a team with no participation UTR for
that season at all — the old snapshot could not (`match_utr` was NOT NULL).
So every reader needs an answer to "what do we use when the frozen value is
missing", and every reader needs the *same* answer: the roster page and the
lineup engine must not disagree about one player's number.

The order below is the committee's own algorithm, not a convenience of this
codebase: a Rated player is used at their current value, a Projected one is
overridden with last year's participation UTR.

Pure — no session, no query. The origin comes back as an enum plus a year;
the Chinese wording lives in the frontend, so changing a label does not
touch a backend test.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Sequence


@dataclass(frozen=True)
class SeasonUtrView:
    """One `player_season_utrs` row, already read out of the database."""

    season_year: int
    value: Decimal

    #: The row holds two candidate values and nobody has ruled between them.
    #: `value` is the larger one; see `ResolvedUtr.is_unresolved`.
    is_unresolved: bool = False


@dataclass(frozen=True)
class ResolvedUtr:
    value: Decimal

    #: `frozen` — this season's committee value.
    #: `current_doubles` / `prior_season` — derived, and the caller must say so.
    origin: str

    #: Which season the value came from. Present for `frozen` and
    #: `prior_season`; None for `current_doubles`, which is not a season value.
    origin_year: Optional[int] = None

    #: Rides along rather than being folded into `origin`: an unresolved value
    #: is a *frozen* value nobody has ruled on yet, which is a different claim
    #: from "we derived this".
    is_unresolved: bool = False


def resolve_match_utr(
    season_utrs: Sequence[SeasonUtrView],
    current_doubles: Optional[Decimal],
    current_doubles_status: Optional[str],
    season_year: int,
) -> Optional[ResolvedUtr]:
    """The participation UTR to use, or None when nothing can be derived."""
    for entry in season_utrs:
        if entry.season_year == season_year:
            return ResolvedUtr(
                value=entry.value,
                origin="frozen",
                origin_year=entry.season_year,
                is_unresolved=entry.is_unresolved,
            )

    # Only a rated current value stands in. Projected and unrated numbers are
    # the committee's own reason for overriding with last year's figure, so
    # trusting them here would undo the rule the chain exists to follow.
    if current_doubles is not None and (current_doubles_status or "").lower() == "rated":
        return ResolvedUtr(value=current_doubles, origin="current_doubles")

    # The most recent earlier season that has a value, not "last year": a
    # player who sat out 2025 still has a 2024 number, and looking only one
    # year back would drop them from the lineup entirely.
    earlier = [entry for entry in season_utrs if entry.season_year < season_year]
    if earlier:
        # Sorted here rather than trusted from the caller — two readers pass
        # this list in and they must not disagree about which year wins.
        latest = max(earlier, key=lambda entry: entry.season_year)
        return ResolvedUtr(
            value=latest.value,
            origin="prior_season",
            origin_year=latest.season_year,
            is_unresolved=latest.is_unresolved,
        )

    return None
