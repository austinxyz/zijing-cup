"""Parse the committee's roster CSV into records plus a report of what could
not be made sense of.

Pure: text in, values out. No database, no I/O.

The sheet is a working document, not an export format. It carries merged-cell
footnotes that leak into data rows, sampling-window columns whose dates move
every season, and a rating status that only sometimes determines the rule
class. The parser's job is half extraction and half **saying what it could not
read** — a silently partial roster makes lineup analysis look fine and be
wrong.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Optional

# `Team` values that are not teams: merged-cell captions that leaked into data
# rows. Treating them as teams would invent clubs out of a footnote.
PSEUDO_TEAMS = frozenset({"Borrowed Player", "Unrated/Projected/Appeal"})

# Column headers the file must have. Their absence means this is not the sheet
# we think it is, and importing it would produce a roster with no
# participation UTRs.
REQUIRED_COLUMNS = ("Team", "Last Name", "First Name", "DUTR Status", "Match UTR")

OPTIONAL_COLUMNS = ("Gender", "Notes")

# Reference columns that exist in the sheet and are deliberately not stored.
IGNORED_COLUMNS = frozenset(
    {"Verified SUTR (Reference)", "SUTR Status (Reference)"}
)

# The sampling-window columns. Matched by prefix because the dates move: 2025
# sampled 09/22-09/26, 2026 samples 09/21-09/25. Hardcoding a full header
# would drop every daily value the year the window shifts.
DAILY_PREFIXES = ("Verified DUTR", "DUTR ")

# DUTR Status word -> rule class (docs/domain/rules.md §7).
#
# `Unrated` is deliberately absent: whether such a player is
# committee-adjudicated or self-rated depends on USTA match history, which the
# sheet does not carry. Guessing would silently decide who counts against the
# "at most 2 self-rated on court, may not partner each other" cap.
RATING_CLASS_BY_STATUS = {
    "Rated": "verified",
    "Projected": "committee",
}


@dataclass(frozen=True)
class RosterRecord:
    team_code: str
    last_name: str
    first_name: str
    gender: Optional[str]
    match_utr: Decimal
    dutr_status: str
    rating_class: Optional[str]
    source_note: Optional[str]
    daily_utrs: list[Decimal]


@dataclass
class ParseResult:
    entries: list[RosterRecord] = field(default_factory=list)
    #: Rows deliberately not imported, with the reason they were skipped.
    skipped_rows: list[str] = field(default_factory=list)
    #: Rows that should have been importable but were not, with why.
    unparsable_rows: list[tuple[str, str]] = field(default_factory=list)
    #: Headers present in the file that this parser does not understand.
    unknown_columns: list[str] = field(default_factory=list)


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def _decimal_or_none(raw: str) -> Optional[Decimal]:
    """A blank sample is absent, not zero — 0.00 is a real value the sheet
    uses for unrated players."""
    if not raw:
        return None
    return Decimal(raw)


def _rating_class_for(status: str) -> Optional[str]:
    """Classify by the status word, ignoring any `/ Appeal` suffix.

    The suffix records that a value was adjusted by hand; it does not change
    which of the three rule classes the player falls into.
    """
    head = status.split("/")[0].strip()
    return RATING_CLASS_BY_STATUS.get(head)


def _daily_columns(fieldnames: list[str]) -> list[str]:
    # The named scalar columns are excluded explicitly: "DUTR Status" also
    # starts with "DUTR ", and matching it here would try to read the word
    # "Rated" as a decimal and reject every row in the file.
    named = set(REQUIRED_COLUMNS) | set(OPTIONAL_COLUMNS) | IGNORED_COLUMNS
    return [
        name
        for name in fieldnames
        if name not in named
        and any(name.startswith(prefix) for prefix in DAILY_PREFIXES)
    ]


def parse_roster_csv(text: str) -> ParseResult:
    """Parse roster CSV text. Raises ValueError only when the file's shape is
    wrong; individual bad rows are reported, never raised."""
    reader = csv.DictReader(io.StringIO(text))
    fieldnames = [name.strip() for name in (reader.fieldnames or [])]

    missing = [name for name in REQUIRED_COLUMNS if name not in fieldnames]
    if missing:
        raise ValueError(
            f"roster CSV is missing required column(s): {', '.join(missing)}"
        )

    daily_columns = _daily_columns(fieldnames)
    known = (
        set(REQUIRED_COLUMNS)
        | set(OPTIONAL_COLUMNS)
        | IGNORED_COLUMNS
        | set(daily_columns)
    )

    result = ParseResult(
        unknown_columns=[
            name for name in fieldnames if name and name not in known
        ]
    )

    for row in reader:
        row = {(k or "").strip(): v for k, v in row.items()}
        raw = ",".join(_clean(row.get(name)) for name in fieldnames)

        team_code = _clean(row.get("Team"))
        if not team_code:
            continue  # blank spacer row

        if team_code in PSEUDO_TEAMS:
            result.skipped_rows.append(
                f"{raw}  [not a roster row: '{team_code}' is a sheet footnote]"
            )
            continue

        last_name = _clean(row.get("Last Name"))
        first_name = _clean(row.get("First Name"))
        if not last_name or not first_name:
            result.unparsable_rows.append((raw, "missing last or first name"))
            continue

        status = _clean(row.get("DUTR Status"))
        if not status:
            result.unparsable_rows.append((raw, "missing DUTR Status"))
            continue

        try:
            match_utr = Decimal(_clean(row.get("Match UTR")))
        except (InvalidOperation, ValueError):
            result.unparsable_rows.append(
                (raw, f"Match UTR is not a number: {_clean(row.get('Match UTR'))!r}")
            )
            continue

        try:
            daily = [
                value
                for value in (
                    _decimal_or_none(_clean(row.get(name))) for name in daily_columns
                )
                if value is not None
            ]
        except (InvalidOperation, ValueError) as exc:
            result.unparsable_rows.append((raw, f"bad daily UTR value: {exc}"))
            continue

        gender = _clean(row.get("Gender")) or None
        note = _clean(row.get("Notes")) or None

        result.entries.append(
            RosterRecord(
                team_code=team_code,
                last_name=last_name,
                first_name=first_name,
                gender=gender,
                match_utr=match_utr,
                dutr_status=status,
                rating_class=_rating_class_for(status),
                source_note=note,
                daily_utrs=daily,
            )
        )

    return result
