"""The sheet that carries current UTRs out to a human and back.

The whole point of this module is what it does **not** do: it never decides
which player a row is about. The sheet leaves carrying each player's own
`players.id` and comes back with it untouched, so identity is a round trip
rather than a match.

That matters more here than it did for the roster import. A roster matched to
the wrong person shows up as a name in a squad it does not belong to — visible.
A current UTR matched to the wrong person is a perfectly plausible number on
the wrong row, and it feeds the participation-UTR derivation chain, which then
produces a lineup that looks legal and is not.

Pure — no session, no query. Values stay as the strings the sheet carried;
converting them is the caller's business, and a value the caller cannot
convert has to be reportable as an error rather than silently coerced.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from app.models.players import CURRENT_UTR_STATUSES

#: The columns, in order. Export writes them; import expects them.
COLUMNS = [
    "id",
    "姓",
    "名",
    "当前单打",
    "单打状态",
    "当前双打",
    "双打状态",
    "UTR链接",
]


@dataclass(frozen=True)
class SheetRow:
    """One row as it came back, before anything has been checked against the
    database.

    `line_number` is 1-based and counts the header, so it matches what the
    person sees in their spreadsheet — an error that names a line they cannot
    find is worse than no line number at all.
    """

    line_number: int
    player_id: Optional[int]
    last_name: str
    first_name: str

    #: Kept as written. Empty string means the cell was blank, which is a
    #: different claim from "-" (clear it) and must stay distinguishable here.
    singles_utr: str = ""
    singles_status: str = ""
    doubles_utr: str = ""
    doubles_status: str = ""
    utr_link: str = ""


def parse_sheet(text: str) -> list[SheetRow]:
    """Split a pasted block or an uploaded file into rows.

    Tabs are what a spreadsheet puts on the clipboard; commas are what it
    writes to a file. Both are normalised into one row shape here, at the
    single entry point, so nothing downstream can behave differently
    depending on which way the content arrived — two entry points that
    disagreed would leave the reader with no way to tell which to believe.
    """
    lines = text.splitlines()
    delimiter = _delimiter_of(lines[0] if lines else "")

    rows: list[SheetRow] = []
    for index, line in enumerate(lines[1:], start=2):
        rows.append(_row_from_cells(index, line.split(delimiter)))
    return rows


@dataclass(frozen=True)
class PlayerView:
    """A player as the database has them, for the diff to compare against."""

    player_id: int
    last_name: str
    first_name: str
    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None
    utr_profile_id: Optional[str] = None


@dataclass(frozen=True)
class FieldChange:
    field: str
    #: None means the field had no value. Rendered as 「不变」 upstream only
    #: when the field produced no FieldChange at all — an absent change and a
    #: change *to* absent are different claims.
    old: Optional[str]
    new: Optional[str]


@dataclass(frozen=True)
class PlayerChange:
    player_id: int
    last_name: str
    first_name: str
    fields: list[FieldChange]


@dataclass(frozen=True)
class SheetError:
    line_number: int
    message: str


#: The five fields a row can carry, in the order the sheet lays them out.
FIELDS = [
    "singles_utr",
    "singles_status",
    "doubles_utr",
    "doubles_status",
    "utr_profile_id",
]


@dataclass(frozen=True)
class DiffResult:
    changes: list[PlayerChange]
    errors: list[SheetError]

    #: How many changes each field accounts for. This is what a per-person
    #: layout cannot show: its rows do not line up into columns, so a whole
    #: column pasted one place over is invisible. Here it shows as one field
    #: with an implausibly high count.
    counts: dict[str, int]

    #: How many of the team's players the sheet spoke about, and how many it
    #: said nothing about. A short sheet is a normal use, not an error — but
    #: unreported it would read as the whole squad.
    covered: int
    not_covered: int


def diff_sheet(
    rows: list[SheetRow], players: list[PlayerView]
) -> DiffResult:
    """What this sheet would change, and what is wrong with it.

    Computes only. Writing is a separate step behind a human confirmation,
    because the filling-in happens outside this system and the mistake it
    invites — a whole column pasted one place over — is one you can see
    before it lands and cannot see after.
    """
    by_id = {person.player_id: person for person in players}

    changes: list[PlayerChange] = []
    errors: list[SheetError] = []

    for row in rows:
        if _is_blank(row):
            continue

        # Identity first: everything below is about a specific person, and
        # there is deliberately no path from "no usable id" to a person.
        if row.player_id is None:
            errors.append(
                SheetError(
                    row.line_number,
                    "这一行没有 id。id 是这张表认人的唯一依据 —— "
                    "系统不会按姓名去猜，请重新导出一份表再填。",
                )
            )
            continue

        person = by_id.get(row.player_id)
        if person is None:
            errors.append(
                SheetError(
                    row.line_number,
                    f"id {row.player_id} 不在这支球队里",
                )
            )
            continue

        if (row.last_name, row.first_name) != (person.last_name, person.first_name):
            errors.append(
                SheetError(
                    row.line_number,
                    f"id {row.player_id} 在库里是「{person.last_name}"
                    f"{person.first_name}」，表里这一行写的是"
                    f"「{row.last_name}{row.first_name}」 —— "
                    "通常是行被打乱或粘错位了",
                )
            )
            continue

        row_errors = (
            _pairing_errors(row) + _status_errors(row) + _link_errors(row)
        )
        if row_errors:
            errors.extend(row_errors)
            continue

        fields = _changed_fields(row, person)
        if fields:
            changes.append(
                PlayerChange(
                    player_id=person.player_id,
                    last_name=person.last_name,
                    first_name=person.first_name,
                    fields=fields,
                )
            )

    counts = {name: 0 for name in FIELDS}
    for change in changes:
        for field in change.fields:
            counts[field.field] += 1

    # Counted off the rows that named a real player, so a sheet full of
    # unrecognised ids does not claim to have covered anybody.
    covered = len({row.player_id for row in rows if row.player_id in by_id})

    return DiffResult(
        changes=changes,
        errors=errors,
        counts=counts,
        covered=covered,
        not_covered=len(players) - covered,
    )


#: What a cell says when it means "take this value away". Blank cannot carry
#: that meaning: blank has to stay available for "I did not fill this one in",
#: which is what most cells are on most imports.
CLEAR = "-"


def _is_blank(row: SheetRow) -> bool:
    """A wholly empty line — a trailing newline, or a gap in the paste.

    Skipped rather than reported: an empty line carries no claim about
    anyone, so there is nothing to be wrong about.
    """
    return not any(
        [
            row.player_id is not None,
            row.last_name,
            row.first_name,
            row.singles_utr,
            row.singles_status,
            row.doubles_utr,
            row.doubles_status,
            row.utr_link,
        ]
    )


def _pairing_errors(row: SheetRow) -> list[SheetError]:
    """A UTR and its status travel together or not at all.

    A number with no status is one the derivation chain will refuse to use,
    while the roster page shows it like any other — the reader ends up
    treating a number as usable that nothing will use.
    """
    errors: list[SheetError] = []
    for label, value, status in [
        ("单打", row.singles_utr, row.singles_status),
        ("双打", row.doubles_utr, row.doubles_status),
    ]:
        if value and not status:
            errors.append(
                SheetError(
                    row.line_number,
                    f"{label}填了值但没填状态 —— 没有状态的 UTR 排阵用不上",
                )
            )
        elif status and not value:
            errors.append(
                SheetError(
                    row.line_number,
                    f"{label}填了状态但没填值",
                )
            )
    return errors


def _status_errors(row: SheetRow) -> list[SheetError]:
    """The status column speaks UTR's vocabulary and only UTR's.

    `verified` / `committee` / `captain` belong to the committee's separate
    vocabulary for participation UTRs. The two sets look alike and mean
    different things, so an unrecognised word is refused rather than mapped —
    mapping one into the other would quietly restate a fact nobody asserted.
    """
    errors: list[SheetError] = []
    for label, written in [
        ("单打状态", row.singles_status),
        ("双打状态", row.doubles_status),
    ]:
        if not written or written == CLEAR:
            continue
        if written.lower() not in CURRENT_UTR_STATUSES:
            errors.append(
                SheetError(
                    row.line_number,
                    f"{label} 只接受 unrated / projected / rated，"
                    f"读到的是「{written}」",
                )
            )
    return errors


def _normalised_status(written: str) -> str:
    return written if written == CLEAR else written.lower()


def profile_id_from(written: str) -> Optional[str]:
    """The profile id inside whatever the person pasted, or None.

    A bare id and a full profile link both end up as the same stored value,
    because the column exists to link out to one profile and the two forms
    name the same one. Anything with no id in it returns None so the caller
    can refuse it: storing the raw text would leave a column that is half ids
    and half prose, with nothing downstream able to tell which it holds.
    """
    trimmed = written.strip()
    if trimmed.isdigit():
        return trimmed
    digits = re.findall(r"\d+", trimmed)
    return digits[-1] if digits else None


def _normalised_link(written: str) -> str:
    if not written or written == CLEAR:
        return written
    return profile_id_from(written) or written


def _link_errors(row: SheetRow) -> list[SheetError]:
    if not row.utr_link or row.utr_link == CLEAR:
        return []
    if profile_id_from(row.utr_link) is None:
        return [
            SheetError(
                row.line_number,
                f"UTR链接 里没有可识别的档案 ID：「{row.utr_link}」",
            )
        ]
    return []


def _changed_fields(row: SheetRow, person: PlayerView) -> list[FieldChange]:
    pairs = [
        ("singles_utr", row.singles_utr, person.singles_utr),
        ("singles_status", _normalised_status(row.singles_status), person.singles_status),
        ("doubles_utr", row.doubles_utr, person.doubles_utr),
        ("doubles_status", _normalised_status(row.doubles_status), person.doubles_status),
        ("utr_profile_id", _normalised_link(row.utr_link), person.utr_profile_id),
    ]

    fields: list[FieldChange] = []
    for name, written, existing in pairs:
        if written == "":
            continue
        old = None if existing is None else str(existing)
        new = None if written == CLEAR else written
        if new != old:
            fields.append(FieldChange(field=name, old=old, new=new))
    return fields


def _delimiter_of(header: str) -> str:
    """Read the separator off the header rather than guessing per line.

    A body line can be entirely empty cells, which says nothing about the
    separator; the header always has all eight column names.
    """
    return "\t" if "\t" in header else ","


def _row_from_cells(line_number: int, cells: list[str]) -> SheetRow:
    def cell(position: int) -> str:
        return cells[position].strip() if position < len(cells) else ""

    raw_id = cell(0)
    return SheetRow(
        line_number=line_number,
        player_id=int(raw_id) if raw_id.isdigit() else None,
        last_name=cell(1),
        first_name=cell(2),
        singles_utr=cell(3),
        singles_status=cell(4),
        doubles_utr=cell(5),
        doubles_status=cell(6),
        utr_link=cell(7),
    )
