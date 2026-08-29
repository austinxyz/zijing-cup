"""Who is one person, and what does one person's season look like.

Pure: roster rows in, decisions out. No database — deciding identity is a
guess, and a guess has to be testable against awkward hand-built combinations
rather than whatever a seeded team happens to contain. Same reason
`app/lineups/rules.py` is pure.

The identity rule is deliberately dumb: normalise whitespace and case, then
compare. No fuzzy matching, no alias stripping, no reordering of the two name
halves. Every clever rule would be right on some rows and wrong on others —
`Xie Yuntao "Young"` and the handful of rows where the sheet has the columns
swapped — and the wrong ones leave no trace. A dumb rule is wrong in ways a
human can see and fix with merge and split.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, Optional, Sequence

#: The committee sheet's status word -> the participation-UTR status we are
#: willing to state. `Unrated` is deliberately absent: whether such a player is
#: committee-adjudicated or captain-rated depends on USTA match history the
#: sheet does not carry, so it maps to None and a human decides later.
_STATUS_FROM_SHEET = {
    "rated": "verified",
    "projected": "committee",
}


@dataclass(frozen=True)
class SourceRow:
    """One `roster_entries` row, already read out of the database."""

    last_name: str
    first_name: str
    season_year: int
    division_code: str
    team_code: str
    match_utr: Decimal
    gender: Optional[str] = None
    dutr_status: str = ""
    rating_class: Optional[str] = None
    utr_profile_id: Optional[str] = None


@dataclass
class SeasonUtrPlan:
    season_year: int
    value: Decimal
    alt_value: Optional[Decimal] = None
    is_unresolved: bool = False
    status: Optional[str] = None
    under_appeal: bool = False
    source: str = "committee_sheet"


@dataclass
class MembershipPlan:
    season_year: int
    division_code: str
    team_code: str


@dataclass
class PlayerPlan:
    identity: str
    last_name: str
    first_name: str
    gender: Optional[str] = None
    utr_profile_id: Optional[str] = None
    season_utrs: list[SeasonUtrPlan] = field(default_factory=list)
    memberships: list[MembershipPlan] = field(default_factory=list)


def identity_key(last_name: str, first_name: str) -> str:
    """The guess: trimmed, lower-cased, and the two halves kept apart.

    The separator matters — joining "Li"+"Shen" and "Lis"+"hen" into one string
    would make them the same person.
    """
    return f"{' '.join(last_name.split()).lower()}\x1f{' '.join(first_name.split()).lower()}"


def status_from_sheet(dutr_status: str) -> tuple[Optional[str], bool]:
    """The sheet's status word -> (status, under_appeal).

    Appeal is a suffix that can ride on any of the three words, so it comes
    back as its own flag: the real 2025 data contains `Rated / Appeal`,
    `Projected / Appeal` AND `Unrated / Appeal`.
    """
    raw = (dutr_status or "").strip()
    under_appeal = "appeal" in raw.lower()
    head = raw.split("/")[0].strip().lower()
    return _STATUS_FROM_SHEET.get(head), under_appeal


def _resolve_season(rows: Sequence[SourceRow], season_year: int) -> SeasonUtrPlan:
    """One season's participation UTR, and whether it is contested.

    The two divisions freeze their sheets days apart, so the same person can
    carry two slightly different numbers for one season (17 people did in
    2025). The larger one wins the `value` slot and the smaller is kept beside
    it — NOT because larger is more likely right, but because participation UTR
    is read almost entirely as an upper bound: reading low would present an
    illegal lineup as legal and only surface on match day, while reading high
    merely withholds a few legal options. There is no neutral default here.
    """
    values = sorted({r.match_utr for r in rows}, reverse=True)
    top = values[0]
    # Prefer the status of a row that actually carries the winning value, so
    # the status and the number describe the same sheet entry.
    winning = next(r for r in rows if r.match_utr == top)
    status, under_appeal = status_from_sheet(winning.dutr_status)

    if len(values) == 1:
        return SeasonUtrPlan(
            season_year=season_year,
            value=top,
            status=status,
            under_appeal=under_appeal,
        )

    return SeasonUtrPlan(
        season_year=season_year,
        value=top,
        alt_value=values[1],
        is_unresolved=True,
        status=status,
        under_appeal=under_appeal,
    )


def group_rows(rows: Iterable[SourceRow]) -> list[PlayerPlan]:
    """Roster rows -> one plan per person.

    Output order follows the identity key rather than the input order: the same
    roster has to produce the same answer whichever way the rows arrive, or a
    re-run would hand out different player IDs.
    """
    buckets: dict[str, list[SourceRow]] = {}
    for row in rows:
        buckets.setdefault(identity_key(row.last_name, row.first_name), []).append(row)

    plans: list[PlayerPlan] = []
    for identity in sorted(buckets):
        owned = buckets[identity]
        first = owned[0]

        seasons: dict[int, list[SourceRow]] = {}
        for row in owned:
            seasons.setdefault(row.season_year, []).append(row)

        plans.append(
            PlayerPlan(
                identity=identity,
                last_name=first.last_name.strip(),
                first_name=first.first_name.strip(),
                # The sheet leaves these blank on some rows and filled on
                # others for the same person; take the first thing anyone
                # actually said rather than the first row's silence.
                gender=next((r.gender for r in owned if r.gender), None),
                utr_profile_id=next(
                    (r.utr_profile_id for r in owned if r.utr_profile_id), None
                ),
                season_utrs=[
                    _resolve_season(seasons[year], year) for year in sorted(seasons)
                ],
                memberships=[
                    MembershipPlan(
                        season_year=row.season_year,
                        division_code=row.division_code,
                        team_code=row.team_code,
                    )
                    for row in sorted(
                        owned,
                        key=lambda r: (r.season_year, r.division_code, r.team_code),
                    )
                ],
            )
        )
    return plans
