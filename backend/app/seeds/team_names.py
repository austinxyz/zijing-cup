"""Import team display names from TOML seed files.

The committee CSV carries no team names — only codes like `USTC-CMU-HQU`. A
name is a human's choice, so it gets a seed file and the same shape as the
rules importer: parse → read → compare → write only the differences, with
`--check` reusing that same comparison rather than a second implementation
that can drift from it.

Two consequences of "the seed is the source of truth" that are easy to get
wrong and are therefore deliberate here:

- A team that disappears from the seed has its name **cleared**. Treating
  absence as "leave it alone" would make the seed an append-only pile, and
  deleting a name would become impossible without hand-editing the database.
- A seed entry naming a team that does not exist is **reported, not fatal**.
  Rosters are imported before names, so a not-yet-imported team is a normal
  intermediate state; a typo in a code is not, and must be visible.
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence

from sqlmodel import Session, select

from app.db import engine
from app.models import Team

DEFAULT_SEED_DIR = Path(__file__).resolve().parents[2] / "seeds" / "team_names"


@dataclass(frozen=True)
class SeedFile:
    """One seed file: the division it describes, and the names it gives.

    The division is carried separately from the entries because a file with an
    empty `[teams]` table still *describes* that division — it says "no team
    here has a name". Deriving the scope from the entries instead would make
    that file a no-op and leave stale names in place.
    """

    season_year: int
    division_code: str
    teams: list["TeamNameSpec"]

    @property
    def scope(self) -> tuple[int, str]:
        return (self.season_year, self.division_code)


@dataclass(frozen=True)
class TeamNameSpec:
    """One team's name, keyed the way teams are keyed everywhere else."""

    season_year: int
    division_code: str
    code: str
    display_name: str

    @property
    def key(self) -> tuple[int, str, str]:
        return (self.season_year, self.division_code, self.code)


def _require_table(data: dict, name: str, path: Path) -> dict:
    value = data.get(name)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name}: missing [{name}] table")
    return value


def parse_seed_file(path: Path) -> SeedFile:
    """Read one seed file. Raises ValueError on anything malformed.

    An empty `[teams]` table is valid: a division where no team has a natural
    Chinese name yet is a normal state, not a broken file.
    """
    with path.open("rb") as handle:
        data = tomllib.load(handle)

    season = _require_table(data, "season", path)
    division = _require_table(data, "division", path)

    year = season.get("year")
    if not isinstance(year, int):
        raise ValueError(f"{path.name}: [season] year must be an integer")

    code = division.get("code")
    if not isinstance(code, str) or not code.strip():
        raise ValueError(f"{path.name}: [division] code must be a non-empty string")

    teams = data.get("teams", {})
    if not isinstance(teams, dict):
        raise ValueError(f"{path.name}: [teams] must be a table of code = name")

    specs: list[TeamNameSpec] = []
    for team_code, display_name in teams.items():
        if not isinstance(display_name, str):
            raise ValueError(
                f"{path.name}: {team_code} name must be a string, "
                f"got {type(display_name).__name__}"
            )
        # A blank name would reach the database as a name that renders as
        # nothing — on screen indistinguishable from unnamed, in the data
        # different. Omit the team from the file instead.
        if not display_name.strip():
            raise ValueError(f"{path.name}: {team_code} has a blank name")
        specs.append(
            TeamNameSpec(year, code.strip(), team_code.strip(), display_name.strip())
        )

    return SeedFile(year, code.strip(), specs)


def parse_seed_dir(seed_dir: Path) -> list[SeedFile]:
    """Every seed file in the directory, in filename order."""
    return [parse_seed_file(path) for path in sorted(seed_dir.glob("*.toml"))]


# --------------------------------------------------------------------------
# Read current state
# --------------------------------------------------------------------------


def scope_of(files: Sequence[SeedFile]) -> set[tuple[int, str]]:
    """The (season, division) pairs the seed files describe.

    Everything outside this is none of the import's business. "Absent from the
    seed means clear the name" is only true within a division the seed
    actually describes — applied globally, importing the silver file would
    wipe every name in gold and report it as an ordinary removal, so the
    damage would read as normal output.

    Taken from the files, not from their entries: a file whose `[teams]` table
    is empty still describes its division, and clearing the last name out of a
    division is exactly the case that would otherwise silently do nothing.
    """
    return {seed.scope for seed in files}


def specs_of(files: Sequence[SeedFile]) -> list[TeamNameSpec]:
    return [spec for seed in files for spec in seed.teams]


def read_current(
    session: Session, scope: set[tuple[int, str]]
) -> dict[tuple[int, str, str], Optional[str]]:
    """Current names for the teams in scope. Includes unnamed teams — the
    comparison needs to see a name that should be cleared."""
    if not scope:
        return {}
    rows = session.exec(
        select(Team.season_year, Team.division_code, Team.code, Team.display_name)
    ).all()
    return {
        (year, division, code): name
        for year, division, code, name in rows
        if (year, division) in scope
    }


# --------------------------------------------------------------------------
# Compare
# --------------------------------------------------------------------------


@dataclass
class Report:
    """What the comparison found. Both modes render this; only one writes."""

    added: list[str]
    changed: list[str]
    removed: list[str]
    #: Seed entries naming a team that does not exist. Not a failure — rosters
    #: are imported before names — but a typo in a code has to be visible.
    unmatched: list[str]

    @property
    def is_clean(self) -> bool:
        return not (self.added or self.changed or self.removed)

    @property
    def has_concerns(self) -> bool:
        return bool(self.unmatched)

    def render(self) -> str:
        lines: list[str] = []
        if self.is_clean:
            lines.append("database matches the team-name seeds")
        else:
            lines.extend(f"  + {entry}" for entry in self.added)
            lines.extend(f"  ~ {entry}" for entry in self.changed)
            lines.extend(f"  - {entry}" for entry in self.removed)
        if self.unmatched:
            lines.append("")
            lines.append("seed 中的球队在库里找不到（先导名单，或 code 拼错了）:")
            lines.extend(f"  ? {entry}" for entry in self.unmatched)
        return "\n".join(lines)


def compare(session: Session, files: Sequence[SeedFile]) -> Report:
    current = read_current(session, scope_of(files))
    report = Report(added=[], changed=[], removed=[], unmatched=[])

    seen: set[tuple[int, str, str]] = set()
    for spec in specs_of(files):
        label = f"{spec.season_year} {spec.division_code} {spec.code}"
        if spec.key not in current:
            report.unmatched.append(f"{label}: {spec.display_name}")
            continue
        seen.add(spec.key)
        existing = current[spec.key]
        if existing is None:
            report.added.append(f"{label}: {spec.display_name}")
        elif existing != spec.display_name:
            report.changed.append(
                f"{label}: {existing} -> {spec.display_name}"
            )

    # A name in the database that the seed no longer describes is cleared:
    # the seed is the source of truth, not an append-only pile.
    for key, existing in current.items():
        if existing is not None and key not in seen:
            year, division, code = key
            report.removed.append(f"{year} {division} {code}: {existing}")

    return report


# --------------------------------------------------------------------------
# Write
# --------------------------------------------------------------------------


def _apply(session: Session, files: Sequence[SeedFile]) -> None:
    scope = scope_of(files)
    wanted = {spec.key: spec.display_name for spec in specs_of(files)}
    for team in session.exec(select(Team)).all():
        if (team.season_year, team.division_code) not in scope:
            continue
        key = (team.season_year, team.division_code, team.code)
        target = wanted.get(key)
        if team.display_name != target:
            team.display_name = target
            session.add(team)
    session.commit()


# --------------------------------------------------------------------------
# Entry points
# --------------------------------------------------------------------------


def check_team_names(
    session: Session, seed_dir: Path = DEFAULT_SEED_DIR
) -> Report:
    """Compare only. Never writes."""
    return compare(session, parse_seed_dir(seed_dir))


def load_team_names(
    session: Session, seed_dir: Path = DEFAULT_SEED_DIR
) -> Report:
    """Compare, then write whatever differs. Idempotent by construction: a
    clean report means nothing is written."""
    desired = parse_seed_dir(seed_dir)
    report = compare(session, desired)
    if not report.is_clean:
        _apply(session, desired)
    return report


def configure_stdout() -> None:
    """Make stdout able to carry the report's Chinese.

    Windows consoles commonly default to cp1252, which cannot encode the team
    names this report echoes — the command would do all its work and then die
    printing the result, which reads as "the import broke" when it had already
    finished. `errors="replace"` so a stray character degrades to a
    placeholder rather than losing the whole report.

    Silently does nothing when the stream has no reconfigure(), which is the
    case under pytest and some pipes.
    """
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="replace")


def main(argv: Optional[Sequence[str]] = None) -> int:
    configure_stdout()

    parser = argparse.ArgumentParser(
        prog="load_team_names",
        description="Import team display names from TOML seed files.",
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
        help="directory of *.toml name files (default: backend/seeds/team_names)",
    )
    args = parser.parse_args(argv)

    with Session(engine) as session:
        if args.check:
            report = check_team_names(session, args.seed_dir)
            print(report.render())
            if report.is_clean:
                # Unmatched entries are reported above but are not drift: the
                # database does match every team the seed could reach.
                return 0
            print(
                "seed files and database disagree. Run without --check to import.",
                file=sys.stderr,
            )
            return 1

        report = load_team_names(session, args.seed_dir)
        print(report.render())
        return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
