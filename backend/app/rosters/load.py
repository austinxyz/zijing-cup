"""Import rosters from the committee CSV into the database.

Shape mirrors the rules importer: parse -> read current state -> compare ->
write only the differences, with `--check` stopping after the comparison and
turning it into an exit code. Both modes share ONE comparison, because a
`--check` computing equality separately could report clean while an import
would still write.

One thing differs from the rules importer, and it is the reason this file
cannot just be a copy: **not every column belongs to the CSV.** Three are
maintained by hand — the borrowed-player flag, the UTR profile link, and the
rating class for Unrated players. A whole-row rewrite would reset all three on
every run, and this import runs whenever a roster changes.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models import Division, RosterEntry, Team
from app.rosters.parse import ParseResult, RosterRecord, parse_roster_csv

#: Columns the CSV owns. The importer compares and writes exactly these and
#: nothing else — see the module docstring.
SOURCE_FIELDS = (
    "gender",
    "match_utr",
    "dutr_status",
    "source_note",
    "daily_utrs",
)

#: A team with this many rows or fewer is worth a human glance. The 2025 sheet
#: had a "team" of exactly one player that turned out to be the ranking
#: table's excluded-player note, not a roster.
SUSPICIOUS_ROW_COUNT = 1


@dataclass
class RosterReport:
    """What changed, and what the source could not account for."""

    added: list[str] = field(default_factory=list)
    changed: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)

    skipped_rows: list[str] = field(default_factory=list)
    unparsable_rows: list[tuple[str, str]] = field(default_factory=list)
    unknown_columns: list[str] = field(default_factory=list)
    suspicious_teams: list[str] = field(default_factory=list)

    #: Cross-tab reconciliation, populated only when a ranking CSV is given.
    ranked_without_roster: list[str] = field(default_factory=list)
    rostered_without_ranking: list[str] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not (self.added or self.changed or self.removed)

    @property
    def has_concerns(self) -> bool:
        """Anything a human should look at, even when the write itself was a
        no-op."""
        return bool(
            self.skipped_rows
            or self.unparsable_rows
            or self.unknown_columns
            or self.suspicious_teams
            or self.ranked_without_roster
            or self.rostered_without_ranking
        )

    def render(self) -> str:
        lines: list[str] = []
        if self.is_clean:
            lines.append("database matches the roster CSV")
        else:
            lines.extend(f"  + {e}" for e in self.added)
            lines.extend(f"  ~ {e}" for e in self.changed)
            lines.extend(f"  - {e}" for e in self.removed)

        if self.skipped_rows:
            lines.append("")
            lines.append("skipped (not roster rows):")
            lines.extend(f"  · {row}" for row in self.skipped_rows)
        if self.unparsable_rows:
            lines.append("")
            lines.append("could not parse:")
            lines.extend(f"  ! {row}  — {why}" for row, why in self.unparsable_rows)
        if self.unknown_columns:
            lines.append("")
            lines.append(f"unrecognised columns: {', '.join(self.unknown_columns)}")
        if self.suspicious_teams:
            lines.append("")
            lines.append("teams with a suspicious row count (check by hand):")
            lines.extend(f"  ? {t}" for t in self.suspicious_teams)
        if self.ranked_without_roster:
            lines.append("")
            lines.append("有排名无名单 (ranked, but no roster rows):")
            lines.extend(f"  ? {t}" for t in self.ranked_without_roster)
        if self.rostered_without_ranking:
            lines.append("")
            lines.append("有名单无排名 (rostered, but absent from the ranking):")
            lines.extend(f"  ? {t}" for t in self.rostered_without_ranking)
        return "\n".join(lines)


def parse_ranking_teams(text: str) -> set[str]:
    """Team names from the ranking/seeding tab.

    That tab is two tables side by side separated by a blank spacer column, so
    the same team appears under more than one "... Team" header. Any column
    whose name contains "Team" is treated as a team column and the union is
    taken — the tab's only job here is to answer "which teams does the sheet
    believe are in this division", and none of it is stored.
    """
    reader = csv.DictReader(io.StringIO(text))
    columns = [
        name for name in (reader.fieldnames or []) if name and "Team" in name
    ]
    names: set[str] = set()
    for row in reader:
        for column in columns:
            value = (row.get(column) or "").strip()
            if value:
                names.add(value)
    return names


def _source_values(record: RosterRecord) -> dict[str, object]:
    return {
        "gender": record.gender,
        "match_utr": record.match_utr,
        "dutr_status": record.dutr_status,
        "source_note": record.source_note,
        "daily_utrs": record.daily_utrs or None,
    }


def _current_values(entry: RosterEntry) -> dict[str, object]:
    return {
        "gender": entry.gender,
        "match_utr": entry.match_utr,
        "dutr_status": entry.dutr_status,
        "source_note": entry.source_note,
        "daily_utrs": list(entry.daily_utrs) if entry.daily_utrs else None,
    }


def _rating_class_update(record: RosterRecord, entry: RosterEntry) -> Optional[str]:
    """What the importer may write to `rating_class`, or None to leave it.

    Determinable statuses (Rated, Projected) are the importer's to maintain.
    For Unrated the column belongs to whoever filled it in by hand, so the
    importer never touches it — not even to clear it.
    """
    if record.rating_class is None:
        return None
    if entry is not None and entry.rating_class == record.rating_class:
        return None
    return record.rating_class


def _require_division(session: Session, year: int, code: str) -> None:
    exists = session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == code
        )
    ).one_or_none()
    if exists is None:
        raise ValueError(
            f"no division {code!r} in season {year}; import the competition "
            f"rules first (python -m app.seeds.load_rules)"
        )


def _existing(session: Session, year: int, code: str):
    teams = {
        t.code: t
        for t in session.exec(
            select(Team).where(
                Team.season_year == year, Team.division_code == code
            )
        ).all()
    }
    entries: dict[tuple[str, str, str], RosterEntry] = {}
    for team in teams.values():
        for entry in session.exec(
            select(RosterEntry).where(RosterEntry.team_id == team.id)
        ).all():
            entries[(team.code, entry.last_name, entry.first_name)] = entry
    return teams, entries


def _reject_duplicates(records: list[RosterRecord]) -> None:
    seen: set[tuple[str, str, str]] = set()
    for record in records:
        key = (record.team_code, record.last_name, record.first_name)
        if key in seen:
            raise ValueError(
                f"duplicate roster entry: {record.team_code} "
                f"{record.last_name}{record.first_name} appears twice. "
                f"The snapshot key is (team, last name, first name); importing "
                f"would silently overwrite one of the two players."
            )
        seen.add(key)


def _suspicious(records: list[RosterRecord]) -> list[str]:
    counts: dict[str, int] = {}
    for record in records:
        counts[record.team_code] = counts.get(record.team_code, 0) + 1
    return [
        f"{code}: only {n} row(s)"
        for code, n in sorted(counts.items())
        if n <= SUSPICIOUS_ROW_COUNT
    ]


def _reconcile_with_ranking(
    report: RosterReport, parsed: ParseResult, ranking_text: Optional[str]
) -> None:
    """Say which teams the two tabs disagree about.

    Nothing here is stored. The ranking tab is read to answer one question —
    does the roster we just parsed account for every team the sheet lists? —
    because a roster missing five teams still looks like a complete roster.
    """
    if ranking_text is None:
        return
    ranked = parse_ranking_teams(ranking_text)
    rostered = {record.team_code for record in parsed.entries}
    report.ranked_without_roster = [
        f"{code}: ranked, but no roster rows in this CSV"
        for code in sorted(ranked - rostered)
    ]
    report.rostered_without_ranking = [
        f"{code}: rostered, but absent from the ranking table"
        for code in sorted(rostered - ranked)
    ]


def _compare(
    session: Session,
    parsed: ParseResult,
    year: int,
    code: str,
    ranking_text: Optional[str] = None,
) -> RosterReport:
    """The single comparison both modes use."""
    _reject_duplicates(parsed.entries)

    report = RosterReport(
        skipped_rows=list(parsed.skipped_rows),
        unparsable_rows=list(parsed.unparsable_rows),
        unknown_columns=list(parsed.unknown_columns),
        suspicious_teams=_suspicious(parsed.entries),
    )
    _reconcile_with_ranking(report, parsed, ranking_text)

    _, entries = _existing(session, year, code)
    desired_keys = set()

    for record in parsed.entries:
        key = (record.team_code, record.last_name, record.first_name)
        desired_keys.add(key)
        label = f"{record.team_code} {record.last_name}{record.first_name}"
        entry = entries.get(key)

        if entry is None:
            report.added.append(label)
            continue

        want, have = _source_values(record), _current_values(entry)
        for name in SOURCE_FIELDS:
            if want[name] != have[name]:
                report.changed.append(
                    f"{label}: {name}: {have[name]!r} -> {want[name]!r}"
                )

        if _rating_class_update(record, entry) is not None:
            report.changed.append(
                f"{label}: rating_class: {entry.rating_class!r} -> "
                f"{record.rating_class!r}"
            )

    for key in sorted(entries.keys() - desired_keys):
        report.removed.append(f"{key[0]} {key[1]}{key[2]}: no longer in the CSV")

    return report


def _write(
    session: Session, parsed: ParseResult, year: int, code: str
) -> None:
    teams, entries = _existing(session, year, code)
    desired_keys = set()

    for record in parsed.entries:
        team = teams.get(record.team_code)
        if team is None:
            team = Team(
                season_year=year, division_code=code, code=record.team_code
            )
            session.add(team)
            session.flush()
            teams[record.team_code] = team

        key = (record.team_code, record.last_name, record.first_name)
        desired_keys.add(key)
        entry = entries.get(key)

        if entry is None:
            entry = RosterEntry(
                team_id=team.id,
                last_name=record.last_name,
                first_name=record.first_name,
                rating_class=record.rating_class,
            )
            entries[key] = entry

        # Only the columns the CSV owns. The borrowed-player flag, the profile
        # link and a hand-filled rating class are left exactly as they are.
        for name, value in _source_values(record).items():
            setattr(entry, name, value)

        update = _rating_class_update(record, entry)
        if update is not None:
            entry.rating_class = update

        session.add(entry)

    for key, entry in entries.items():
        if key not in desired_keys:
            session.delete(entry)

    session.flush()

    # A team whose last entry just went away is no longer part of this season.
    for team in list(teams.values()):
        remaining = session.exec(
            select(RosterEntry).where(RosterEntry.team_id == team.id)
        ).first()
        if remaining is None:
            session.delete(team)

    session.commit()


def check_rosters(
    session: Session,
    csv_text: str,
    year: int,
    division_code: str,
    ranking_text: Optional[str] = None,
) -> RosterReport:
    """Compare only. Never writes."""
    _require_division(session, year, division_code)
    return _compare(
        session, parse_roster_csv(csv_text), year, division_code, ranking_text
    )


def load_rosters(
    session: Session,
    csv_text: str,
    year: int,
    division_code: str,
    ranking_text: Optional[str] = None,
) -> RosterReport:
    """Compare, then write whatever differs among the CSV-owned columns."""
    _require_division(session, year, division_code)
    parsed = parse_roster_csv(csv_text)
    report = _compare(session, parsed, year, division_code, ranking_text)
    if not report.is_clean:
        _write(session, parsed, year, division_code)
    return report
