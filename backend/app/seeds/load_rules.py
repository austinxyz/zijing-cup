"""Import competition rules from TOML seed files into the database.

The seed files are the single source of truth; the database is a projection.
Changing a rule means editing a file, having the diff reviewed, and running
this importer — there is no write API and no admin UI.

Shape of the run, in three steps:

    parse the seed files  ->  read what the database currently holds
                          ->  compare  ->  write only the differences

`--check` stops after the comparison and turns the result into an exit code.
Both modes go through the SAME comparison, which is the point: a --check that
computed "are these equal?" separately from the writer could report clean
while an import would still write, and that is precisely the drift this mode
exists to catch.

Usage:
    uv run python -m app.seeds.load_rules            # import
    uv run python -m app.seeds.load_rules --check    # compare only, exit 1 on drift
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Optional, Sequence

from sqlmodel import Session, delete, select

from app.db import engine
from app.models import (
    Division,
    DivisionBorrowedLimit,
    DivisionEligibilityLimit,
    DivisionLine,
    Season,
)

DEFAULT_SEED_DIR = Path(__file__).resolve().parents[2] / "seeds" / "rules"


# --------------------------------------------------------------------------
# Normalised, comparable representation
#
# Parsing a seed file and reading the database both produce these, so the
# comparison is a plain equality check on frozen dataclasses rather than a
# hand-written field-by-field walk that can silently forget a field.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class LineSpec:
    code: str
    kind: str
    sort_order: int
    cap: Optional[Decimal]  # None == open line, no ceiling at all
    points: int


@dataclass(frozen=True)
class LimitSpec:
    gender: str
    utr_above: Decimal
    max_players: int
    # None == any line. A tuple (not a list) so the dataclass stays hashable
    # and comparable.
    restricted_to_lines: Optional[tuple[str, ...]]


@dataclass(frozen=True)
class BorrowedSpec:
    #: How many schools the 联队 team combines.
    school_count: int
    #: Roster cap (data-entry warning) and on-court cap (hard rule).
    roster_cap: int
    on_court_cap: int


@dataclass(frozen=True)
class DivisionSpec:
    season_year: int
    edition_name: Optional[str]
    code: str
    display_name: str
    scoring_mode: str
    buffer_per_line: Decimal
    buffer_total: Decimal
    partner_gap_max: Decimal
    mens_doubles_must_be_ordered: bool
    lines: tuple[LineSpec, ...]
    limits: tuple[LimitSpec, ...]
    borrowed_limits: tuple[BorrowedSpec, ...] = ()

    @property
    def key(self) -> tuple[int, str]:
        return (self.season_year, self.code)


def _dec(value: object) -> Decimal:
    """Seed values are written as strings and parsed exactly.

    A TOML float cannot hold 0.30, and these numbers decide whether a lineup
    is legal — a cap that drifts by 0.01 is a different answer, not a
    rounding detail.
    """
    return Decimal(str(value))


def _opt_dec(value: object) -> Optional[Decimal]:
    return None if value is None else _dec(value)


# --------------------------------------------------------------------------
# Step 1 — parse
# --------------------------------------------------------------------------


def parse_seed_file(path: Path) -> DivisionSpec:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    season = data["season"]
    division = data["division"]

    lines = tuple(
        sorted(
            (
                LineSpec(
                    code=line["code"],
                    kind=line["kind"],
                    sort_order=line["sort_order"],
                    # A missing cap is an open line. Absence is the rule, so
                    # it must not be defaulted to a number.
                    cap=_opt_dec(line.get("cap")),
                    points=line["points"],
                )
                for line in data["lines"]
            ),
            key=lambda line: line.sort_order,
        )
    )

    limits = tuple(
        sorted(
            (
                LimitSpec(
                    gender=limit["gender"],
                    utr_above=_dec(limit["utr_above"]),
                    max_players=limit["max_players"],
                    restricted_to_lines=(
                        tuple(limit["restricted_to_lines"])
                        if limit.get("restricted_to_lines") is not None
                        else None
                    ),
                )
                for limit in data.get("eligibility_limits", [])
            ),
            key=lambda limit: (limit.gender, limit.utr_above),
        )
    )

    borrowed_limits = tuple(
        sorted(
            (
                BorrowedSpec(
                    school_count=b["school_count"],
                    roster_cap=b["roster_cap"],
                    on_court_cap=b["on_court_cap"],
                )
                for b in data.get("borrowed_limits", [])
            ),
            key=lambda b: b.school_count,
        )
    )

    return DivisionSpec(
        season_year=season["year"],
        edition_name=season.get("edition_name"),
        code=division["code"],
        display_name=division["display_name"],
        scoring_mode=division["scoring_mode"],
        buffer_per_line=_dec(division["buffer_per_line"]),
        buffer_total=_dec(division["buffer_total"]),
        partner_gap_max=_dec(division["partner_gap_max"]),
        mens_doubles_must_be_ordered=division["mens_doubles_must_be_ordered"],
        lines=lines,
        limits=limits,
        borrowed_limits=borrowed_limits,
    )


def parse_seed_dir(seed_dir: Path) -> list[DivisionSpec]:
    files = sorted(seed_dir.glob("*.toml"))
    if not files:
        raise FileNotFoundError(f"no seed files found in {seed_dir}")
    specs = [parse_seed_file(path) for path in files]
    _reject_conflicting_season_metadata(specs)
    return specs


def _reject_conflicting_season_metadata(specs: Sequence[DivisionSpec]) -> None:
    """Both divisions of a season share one `seasons` row, so their `[season]`
    blocks have to agree.

    If they disagree the importer never converges: writing one division sets
    the shared row, the other division then reads back a value its own file
    contradicts, and every run flips it. `--check` would report drift forever,
    pointing at a field nobody edited. Failing here — before anything is
    written — turns a baffling permanent-red into a one-line message.
    """
    by_year: dict[int, dict[Optional[str], list[str]]] = {}
    for spec in specs:
        by_year.setdefault(spec.season_year, {}).setdefault(
            spec.edition_name, []
        ).append(spec.code)

    for year, editions in sorted(by_year.items()):
        if len(editions) > 1:
            detail = "; ".join(
                f"{sorted(codes)} say {edition!r}"
                for edition, codes in sorted(
                    editions.items(), key=lambda item: str(item[0])
                )
            )
            raise ValueError(
                f"season {year}: divisions disagree on [season] metadata "
                f"({detail}). Both divisions of a season share one row — "
                f"make the [season] blocks identical."
            )


# --------------------------------------------------------------------------
# Step 2 — read current state
# --------------------------------------------------------------------------


def read_division(session: Session, year: int, code: str) -> Optional[DivisionSpec]:
    division = session.exec(
        select(Division).where(Division.season_year == year, Division.code == code)
    ).one_or_none()
    if division is None:
        return None

    season = session.get(Season, year)

    lines = tuple(
        sorted(
            (
                LineSpec(
                    code=line.code,
                    kind=line.kind,
                    sort_order=line.sort_order,
                    cap=line.cap,
                    points=line.points,
                )
                for line in session.exec(
                    select(DivisionLine).where(
                        DivisionLine.division_id == division.id
                    )
                ).all()
            ),
            key=lambda line: line.sort_order,
        )
    )

    limits = tuple(
        sorted(
            (
                LimitSpec(
                    gender=limit.gender,
                    utr_above=limit.utr_above,
                    max_players=limit.max_players,
                    restricted_to_lines=(
                        tuple(limit.restricted_to_lines)
                        if limit.restricted_to_lines is not None
                        else None
                    ),
                )
                for limit in session.exec(
                    select(DivisionEligibilityLimit).where(
                        DivisionEligibilityLimit.division_id == division.id
                    )
                ).all()
            ),
            key=lambda limit: (limit.gender, limit.utr_above),
        )
    )

    borrowed_limits = tuple(
        sorted(
            (
                BorrowedSpec(
                    school_count=b.school_count,
                    roster_cap=b.roster_cap,
                    on_court_cap=b.on_court_cap,
                )
                for b in session.exec(
                    select(DivisionBorrowedLimit).where(
                        DivisionBorrowedLimit.division_id == division.id
                    )
                ).all()
            ),
            key=lambda b: b.school_count,
        )
    )

    return DivisionSpec(
        season_year=division.season_year,
        edition_name=season.edition_name if season else None,
        code=division.code,
        display_name=division.display_name,
        scoring_mode=division.scoring_mode,
        buffer_per_line=division.buffer_per_line,
        buffer_total=division.buffer_total,
        partner_gap_max=division.partner_gap_max,
        mens_doubles_must_be_ordered=division.mens_doubles_must_be_ordered,
        lines=lines,
        limits=limits,
        borrowed_limits=borrowed_limits,
    )


def read_all_division_keys(session: Session) -> set[tuple[int, str]]:
    return {
        (division.season_year, division.code)
        for division in session.exec(select(Division)).all()
    }


# --------------------------------------------------------------------------
# Step 3 — compare
# --------------------------------------------------------------------------


@dataclass
class Report:
    """What the comparison found. Both modes render this; only one writes."""

    added: list[str]
    changed: list[str]
    removed: list[str]

    @property
    def is_clean(self) -> bool:
        return not (self.added or self.changed or self.removed)

    def render(self) -> str:
        if self.is_clean:
            return "database matches the seed files"
        lines = []
        for entry in self.added:
            lines.append(f"  + {entry}")
        for entry in self.changed:
            lines.append(f"  ~ {entry}")
        for entry in self.removed:
            lines.append(f"  - {entry}")
        return "\n".join(lines)


def _field_differences(desired: DivisionSpec, current: DivisionSpec) -> list[str]:
    """Name every field that differs, so --check output is actionable.

    Reporting only "they differ" would send whoever runs this hunting through
    four files for one changed digit.
    """
    label = f"{desired.season_year} {desired.code}"
    out: list[str] = []

    for field in (
        "edition_name",
        "display_name",
        "scoring_mode",
        "buffer_per_line",
        "buffer_total",
        "partner_gap_max",
        "mens_doubles_must_be_ordered",
    ):
        want, have = getattr(desired, field), getattr(current, field)
        if want != have:
            out.append(f"{label}: {field}: {have!r} -> {want!r}")

    want_lines = {line.code: line for line in desired.lines}
    have_lines = {line.code: line for line in current.lines}
    for code in sorted(want_lines.keys() | have_lines.keys()):
        want, have = want_lines.get(code), have_lines.get(code)
        if want == have:
            continue
        if have is None:
            out.append(f"{label}: line {code}: added")
        elif want is None:
            out.append(f"{label}: line {code}: removed")
        else:
            for field in ("kind", "sort_order", "cap", "points"):
                w, h = getattr(want, field), getattr(have, field)
                if w != h:
                    out.append(f"{label}: line {code}: {field}: {h!r} -> {w!r}")

    want_limits = {(l.gender, l.utr_above): l for l in desired.limits}
    have_limits = {(l.gender, l.utr_above): l for l in current.limits}
    for key in sorted(want_limits.keys() | have_limits.keys()):
        want, have = want_limits.get(key), have_limits.get(key)
        if want == have:
            continue
        name = f"limit {key[0]}>{key[1]}"
        if have is None:
            out.append(f"{label}: {name}: added")
        elif want is None:
            out.append(f"{label}: {name}: removed")
        else:
            for field in ("max_players", "restricted_to_lines"):
                w, h = getattr(want, field), getattr(have, field)
                if w != h:
                    out.append(f"{label}: {name}: {field}: {h!r} -> {w!r}")

    want_borrowed = {b.school_count: b for b in desired.borrowed_limits}
    have_borrowed = {b.school_count: b for b in current.borrowed_limits}
    for key in sorted(want_borrowed.keys() | have_borrowed.keys()):
        want, have = want_borrowed.get(key), have_borrowed.get(key)
        if want == have:
            continue
        name = f"borrowed {key}-school"
        if have is None:
            out.append(f"{label}: {name}: added")
        elif want is None:
            out.append(f"{label}: {name}: removed")
        else:
            for field in ("roster_cap", "on_court_cap"):
                w, h = getattr(want, field), getattr(have, field)
                if w != h:
                    out.append(f"{label}: {name}: {field}: {h!r} -> {w!r}")

    return out


def compare(session: Session, desired: Sequence[DivisionSpec]) -> Report:
    """The single comparison both modes use."""
    added: list[str] = []
    changed: list[str] = []

    for spec in desired:
        current = read_division(session, spec.season_year, spec.code)
        if current is None:
            added.append(f"{spec.season_year} {spec.code}: new rule set")
        elif current != spec:
            changed.extend(_field_differences(spec, current))

    # Anything in the database the seeds no longer describe is a removal.
    # Without this the seeds would only ever be additive and would stop being
    # the source of truth.
    desired_keys = {spec.key for spec in desired}
    removed = [
        f"{year} {code}: rule set no longer in seeds"
        for (year, code) in sorted(read_all_division_keys(session) - desired_keys)
    ]

    return Report(added=added, changed=changed, removed=removed)


# --------------------------------------------------------------------------
# Step 4 — write
# --------------------------------------------------------------------------


def _write_division(session: Session, spec: DivisionSpec) -> None:
    """Replace one division's rules wholesale.

    A rule set is a few rows and is rewritten at most once a year, so
    replacing children beats diffing them row by row: fewer branches, and no
    chance of a partial update leaving a stale line behind.
    """
    if session.get(Season, spec.season_year) is None:
        session.add(Season(year=spec.season_year, edition_name=spec.edition_name))
        session.flush()
    else:
        season = session.get(Season, spec.season_year)
        season.edition_name = spec.edition_name
        session.add(season)

    division = session.exec(
        select(Division).where(
            Division.season_year == spec.season_year, Division.code == spec.code
        )
    ).one_or_none()

    if division is None:
        division = Division(season_year=spec.season_year, code=spec.code)

    division.display_name = spec.display_name
    division.scoring_mode = spec.scoring_mode
    division.buffer_per_line = spec.buffer_per_line
    division.buffer_total = spec.buffer_total
    division.partner_gap_max = spec.partner_gap_max
    division.mens_doubles_must_be_ordered = spec.mens_doubles_must_be_ordered
    session.add(division)
    session.flush()

    session.execute(
        delete(DivisionLine).where(DivisionLine.division_id == division.id)
    )
    session.execute(
        delete(DivisionEligibilityLimit).where(
            DivisionEligibilityLimit.division_id == division.id
        )
    )
    session.execute(
        delete(DivisionBorrowedLimit).where(
            DivisionBorrowedLimit.division_id == division.id
        )
    )
    session.flush()

    for line in spec.lines:
        session.add(
            DivisionLine(
                division_id=division.id,
                code=line.code,
                kind=line.kind,
                sort_order=line.sort_order,
                cap=line.cap,
                points=line.points,
            )
        )

    for limit in spec.limits:
        session.add(
            DivisionEligibilityLimit(
                division_id=division.id,
                gender=limit.gender,
                utr_above=limit.utr_above,
                max_players=limit.max_players,
                restricted_to_lines=(
                    list(limit.restricted_to_lines)
                    if limit.restricted_to_lines is not None
                    else None
                ),
            )
        )

    for borrowed in spec.borrowed_limits:
        session.add(
            DivisionBorrowedLimit(
                division_id=division.id,
                school_count=borrowed.school_count,
                roster_cap=borrowed.roster_cap,
                on_court_cap=borrowed.on_court_cap,
            )
        )


def _remove_divisions(session: Session, keys: Iterable[tuple[int, str]]) -> None:
    for year, code in keys:
        division = session.exec(
            select(Division).where(
                Division.season_year == year, Division.code == code
            )
        ).one_or_none()
        if division is not None:
            session.delete(division)  # children cascade


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------


def check_rules(session: Session, seed_dir: Path = DEFAULT_SEED_DIR) -> Report:
    """Compare only. Never writes."""
    return compare(session, parse_seed_dir(seed_dir))


def load_rules(session: Session, seed_dir: Path = DEFAULT_SEED_DIR) -> Report:
    """Compare, then write whatever differs. Idempotent by construction:
    a clean report means nothing is written."""
    desired = parse_seed_dir(seed_dir)
    report = compare(session, desired)

    if report.is_clean:
        return report

    touched = {
        entry.split(":", 1)[0].strip() for entry in report.added + report.changed
    }
    for spec in desired:
        if f"{spec.season_year} {spec.code}" in touched:
            _write_division(session, spec)

    desired_keys = {spec.key for spec in desired}
    _remove_divisions(session, read_all_division_keys(session) - desired_keys)

    session.commit()
    return report


def main(argv: Optional[Sequence[str]] = None) -> int:
    # Same reason as the roster CLI: this report can name editions like
    # 第十一届, and a cp1252 console would kill the command while printing it.
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(
        prog="load_rules",
        description="Import competition rules from TOML seed files.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "compare only; exit 1 if the database does not match the seeds. "
            "Writes nothing."
        ),
    )
    parser.add_argument(
        "--seed-dir",
        type=Path,
        default=DEFAULT_SEED_DIR,
        help="directory of *.toml rule files (default: backend/seeds/rules)",
    )
    args = parser.parse_args(argv)

    with Session(engine) as session:
        if args.check:
            report = check_rules(session, args.seed_dir)
            print(report.render())
            if report.is_clean:
                return 0
            print(
                "seed files and database disagree. "
                "Run without --check to import.",
                file=sys.stderr,
            )
            return 1

        report = check_rules(session, args.seed_dir)
        if report.removed:
            # Say what is about to disappear before it does. A rule set drops
            # out of the seeds only by deliberate edit, and it is a handful of
            # rows, so it is worth a human glance in the log.
            print("removing rule sets no longer described by the seeds:")
            for entry in report.removed:
                print(f"  - {entry}")

        report = load_rules(session, args.seed_dir)
        print(report.render())
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
