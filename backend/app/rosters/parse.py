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
# The gold and silver tabs spell these differently — silver has an extra
# "For" — which is exactly why unrecognised columns are reported rather than
# dropped: the real file taught us the second spelling.
IGNORED_COLUMNS = frozenset(
    {
        "Verified SUTR (Reference)",
        "SUTR Status (Reference)",
        "Verified SUTR (For Reference)",
        "SUTR Status (For Reference)",
    }
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
    #: Sampling cells holding an annotation instead of a number, e.g.
    #: "Early Lock". The sample is dropped, the player is kept.
    annotated_cells: list[str] = field(default_factory=list)


def _clean(value: Optional[str]) -> str:
    return (value or "").strip()


def _finite_decimal(raw: str) -> Decimal:
    """Parse a UTR value, rejecting the non-finite ones Decimal accepts.

    `Decimal("NaN")` and `Decimal("Infinity")` construct happily. A NaN UTR
    would reach the database and then poison every cap comparison it touches:
    NaN compares false against everything, so a lineup containing one would
    appear to satisfy every limit it was checked against.
    """
    value = Decimal(raw)
    if not value.is_finite():
        raise ValueError(f"UTR value is not finite: {raw!r}")
    return value


def _decimal_or_none(raw: str) -> Optional[Decimal]:
    """A blank sample is absent, not zero — 0.00 is a real value the sheet
    uses for unrated players."""
    if not raw:
        return None
    return _finite_decimal(raw)


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


#: How far into the file to look for the header row. The real Google Sheets
#: export starts with a blank row, then the merged-cell footnotes as their own
#: rows, then another blank — the column names are on line 5.
HEADER_SEARCH_LIMIT = 20


def _find_header(text: str) -> tuple[int, list[str]]:
    """Locate the header row and return its index and column names.

    The exported tab does not begin with the header: assuming row 1 would make
    every subsequent row unparsable and the import would "succeed" with zero
    players — a failure that looks like an empty roster rather than a broken
    read.
    """
    rows = list(csv.reader(io.StringIO(text)))
    for index, row in enumerate(rows[:HEADER_SEARCH_LIMIT]):
        names = [cell.strip() for cell in row]
        if all(column in names for column in REQUIRED_COLUMNS):
            return index, names

    inspected = min(len(rows), HEADER_SEARCH_LIMIT)
    raise ValueError(
        "roster CSV has no header row with the required columns "
        f"({', '.join(REQUIRED_COLUMNS)}) in its first {inspected} row(s)"
    )


def parse_roster_csv(text: str) -> ParseResult:
    """Parse roster CSV text. Raises ValueError only when the file's shape is
    wrong; individual bad rows are reported, never raised."""
    header_index, fieldnames = _find_header(text)

    # Re-read from the header line so DictReader sees the real column names.
    body = "\n".join(text.splitlines()[header_index:])
    reader = csv.DictReader(io.StringIO(body))

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
            match_utr = _finite_decimal(_clean(row.get("Match UTR")))
        except (InvalidOperation, ValueError) as exc:
            reason = (
                str(exc)
                if isinstance(exc, ValueError) and "finite" in str(exc)
                else f"Match UTR is not a number: {_clean(row.get('Match UTR'))!r}"
            )
            result.unparsable_rows.append((raw, reason))
            continue

        # The sampling cells sometimes hold an annotation rather than a
        # number ("Early Lock"). They are evidence for how Match UTR was
        # derived, and Match UTR is the authoritative value — dropping the
        # whole player because a note sits in an evidence cell trades a real
        # roster entry for a footnote. Skip the sample, keep the player, and
        # report the annotation so a new one cannot pass unnoticed.
        # `NaN` is not an annotation and is not skipped: it parses as a Decimal
        # and would then compare false against every cap it met. Only text that
        # is not a number at all is treated as a note.
        daily = []
        bad_daily: Optional[str] = None
        # Grouped per player: the real export annotates all five sampling
        # columns at once, and a line per cell would bury the summary an
        # operator is reading.
        annotations: dict[str, list[str]] = {}
        for name in daily_columns:
            cell = _clean(row.get(name))
            if not cell:
                continue
            try:
                daily.append(_finite_decimal(cell))
            except InvalidOperation:
                annotations.setdefault(cell, []).append(name)
            except ValueError as exc:
                bad_daily = f"bad daily UTR value in {name}: {exc}"
                break

        for note, columns in annotations.items():
            result.annotated_cells.append(
                f"{team_code} {last_name}{first_name}: {note!r} in {', '.join(columns)}"
            )

        if bad_daily:
            result.unparsable_rows.append((raw, bad_daily))
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
