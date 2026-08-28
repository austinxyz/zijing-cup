"""Team display names: seed parsing and import.

The display name is the one team attribute the committee CSV does not carry,
so it needs its own source of truth and its own import path. This mirrors the
rules seed: parse → read → compare → write only the differences, with
`--check` reusing the same comparison.

All team codes and names here are invented, and the seasons are reserved
sentinels so this module cannot collide with real data.
"""

import io
import os
import sys

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal
from pathlib import Path

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import Division, Season, Team
from app.seeds.team_names import (
    TeamNameSpec,
    check_team_names,
    load_team_names,
    parse_seed_file,
)

TEST_YEAR = 1994  # reserved for this module


def write_seed(directory: Path, name: str, body: str) -> Path:
    path = directory / name
    path.write_text(body, encoding="utf-8")
    return path


def seed_body(year: int = TEST_YEAR, code: str = "silver", teams: str = "") -> str:
    return (
        f"[season]\nyear = {year}\n\n"
        f'[division]\ncode = "{code}"\n\n'
        f"[teams]\n{teams}"
    )


class TestParse:
    def test_parses_code_to_name_pairs(self, tmp_path):
        path = write_seed(
            tmp_path,
            "1994-silver.toml",
            seed_body(teams='"NAME-A" = "甲队"\n"NAME-B-C" = "乙丙联队"\n'),
        )

        seed = parse_seed_file(path)

        assert seed.scope == (TEST_YEAR, "silver")
        assert seed.teams == [
            TeamNameSpec(TEST_YEAR, "silver", "NAME-A", "甲队"),
            TeamNameSpec(TEST_YEAR, "silver", "NAME-B-C", "乙丙联队"),
        ]

    def test_empty_teams_table_still_describes_its_division(self, tmp_path):
        # A division where nobody has a natural Chinese name yet is a normal
        # state, not a malformed file. It still describes its division: that
        # is what makes "clear the last remaining name" work.
        path = write_seed(tmp_path, "1994-gold.toml", seed_body(code="gold"))

        seed = parse_seed_file(path)

        assert seed.teams == []
        assert seed.scope == (TEST_YEAR, "gold")

    def test_missing_season_is_rejected(self, tmp_path):
        path = write_seed(
            tmp_path, "broken.toml", '[division]\ncode = "silver"\n\n[teams]\n'
        )

        with pytest.raises(ValueError) as excinfo:
            parse_seed_file(path)
        assert "season" in str(excinfo.value).lower()

    def test_missing_division_is_rejected(self, tmp_path):
        path = write_seed(
            tmp_path, "broken.toml", f"[season]\nyear = {TEST_YEAR}\n\n[teams]\n"
        )

        with pytest.raises(ValueError) as excinfo:
            parse_seed_file(path)
        assert "division" in str(excinfo.value).lower()

    def test_blank_display_name_is_rejected(self, tmp_path):
        # An empty string would land in the database as a name that renders as
        # nothing — indistinguishable from unnamed on screen but different in
        # the data. Leave the team out of the file instead.
        path = write_seed(
            tmp_path, "1994-silver.toml", seed_body(teams='"NAME-A" = ""\n')
        )

        with pytest.raises(ValueError) as excinfo:
            parse_seed_file(path)
        assert "NAME-A" in str(excinfo.value)

    def test_non_string_display_name_is_rejected(self, tmp_path):
        path = write_seed(
            tmp_path, "1994-silver.toml", seed_body(teams='"NAME-A" = 42\n')
        )

        with pytest.raises(ValueError):
            parse_seed_file(path)


# --------------------------------------------------------------------------
# Import against the database
# --------------------------------------------------------------------------


@pytest.fixture
def session():
    with Session(engine) as s:
        _cleanup(s)
        _seed_teams(s)
        yield s
        _cleanup(s)


def _cleanup(s: Session) -> None:
    s.execute(delete(Team).where(Team.season_year == TEST_YEAR))
    s.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    s.execute(delete(Season).where(Season.year == TEST_YEAR))
    s.commit()


def _seed_teams(s: Session) -> None:
    """Two teams in silver, one in gold. Names are imported; teams are not."""
    s.add(Season(year=TEST_YEAR, edition_name="名称测试赛季"))
    s.commit()
    for code, name in (("silver", "银组"), ("gold", "金组")):
        s.add(
            Division(
                season_year=TEST_YEAR,
                code=code,
                display_name=name,
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
    s.commit()
    for division, code in (
        ("silver", "NAME-A"),
        ("silver", "NAME-B"),
        ("gold", "NAME-G"),
    ):
        s.add(Team(season_year=TEST_YEAR, division_code=division, code=code))
    s.commit()


def team(s: Session, code: str) -> Team:
    return s.exec(
        select(Team).where(Team.season_year == TEST_YEAR, Team.code == code)
    ).one()


def seed_dir(tmp_path: Path, teams: str) -> Path:
    write_seed(tmp_path, "1994-silver.toml", seed_body(teams=teams))
    return tmp_path


ONLY_A = '"NAME-A" = "甲队"\n'


class TestImport:
    def test_first_import_names_the_listed_teams(self, session, tmp_path):
        report = load_team_names(session, seed_dir(tmp_path, ONLY_A))

        assert report.added
        session.expire_all()
        assert team(session, "NAME-A").display_name == "甲队"

    def test_teams_absent_from_the_seed_stay_unnamed(self, session, tmp_path):
        # Only some teams have a natural Chinese name. Leaving the rest out is
        # how this file is meant to be used, not an omission to warn about.
        load_team_names(session, seed_dir(tmp_path, ONLY_A))
        session.expire_all()

        assert team(session, "NAME-B").display_name is None
        assert team(session, "NAME-G").display_name is None

    def test_import_does_not_touch_divisions_the_seed_does_not_describe(
        self, session, tmp_path
    ):
        """A seed file describes one (season, division). Everything else is
        out of its scope.

        "Absent from the seed means clear the name" has to be scoped to the
        divisions the seed actually describes. Applied globally, importing the
        silver file would wipe every name in gold — and would report it as an
        ordinary removal, so the damage would look like normal output.
        """
        gold = team(session, "NAME-G")
        gold.display_name = "金队"
        session.add(gold)
        session.commit()

        # The seed directory describes silver only.
        report = load_team_names(session, seed_dir(tmp_path, ONLY_A))

        session.expire_all()
        assert team(session, "NAME-G").display_name == "金队"
        assert not any("NAME-G" in entry for entry in report.removed)

    def test_reimport_reports_no_change(self, session, tmp_path):
        directory = seed_dir(tmp_path, ONLY_A)
        load_team_names(session, directory)

        report = load_team_names(session, directory)

        assert report.is_clean, report.render()

    def test_renaming_in_the_seed_updates_the_team(self, session, tmp_path):
        load_team_names(session, seed_dir(tmp_path, ONLY_A))

        report = load_team_names(
            session, seed_dir(tmp_path, '"NAME-A" = "甲队改名"\n')
        )

        assert report.changed
        session.expire_all()
        assert team(session, "NAME-A").display_name == "甲队改名"

    def test_removing_from_the_seed_clears_the_name(self, session, tmp_path):
        """The seed is the source of truth, not an append-only pile.

        If absence meant "leave it alone", deleting a name would be impossible
        without hand-editing the database.
        """
        load_team_names(session, seed_dir(tmp_path, ONLY_A))

        report = load_team_names(session, seed_dir(tmp_path, ""))

        assert report.removed
        session.expire_all()
        assert team(session, "NAME-A").display_name is None

    def test_clearing_a_name_leaves_the_team_and_its_roster_alone(
        self, session, tmp_path
    ):
        load_team_names(session, seed_dir(tmp_path, ONLY_A))
        load_team_names(session, seed_dir(tmp_path, ""))
        session.expire_all()

        # The team row itself survives; only the name went.
        surviving = team(session, "NAME-A")
        assert surviving.code == "NAME-A"
        assert surviving.division_code == "silver"


class TestUnmatchedEntries:
    def test_seed_entry_for_an_unknown_team_is_reported(self, session, tmp_path):
        """Reported, not fatal, and not silent.

        Rosters are imported before names, so a not-yet-imported team is a
        normal intermediate state — failing here would block a legitimate
        order of operations. A mistyped code is not normal, and would
        otherwise vanish without trace.
        """
        report = load_team_names(
            session, seed_dir(tmp_path, '"NAME-GHOST" = "幽灵队"\n')
        )

        assert any("NAME-GHOST" in entry for entry in report.unmatched)
        assert report.has_concerns

    def test_unmatched_entry_appears_in_the_rendered_report(
        self, session, tmp_path
    ):
        # The CLI prints render(); a list nobody prints is a list nobody reads.
        report = load_team_names(
            session, seed_dir(tmp_path, '"NAME-GHOST" = "幽灵队"\n')
        )

        assert "NAME-GHOST" in report.render()

    def test_unmatched_entry_does_not_block_the_others(self, session, tmp_path):
        report = load_team_names(
            session,
            seed_dir(tmp_path, '"NAME-A" = "甲队"\n"NAME-GHOST" = "幽灵队"\n'),
        )

        assert report.unmatched
        session.expire_all()
        assert team(session, "NAME-A").display_name == "甲队"


class TestCheckMode:
    def test_check_is_clean_when_the_database_matches(self, session, tmp_path):
        directory = seed_dir(tmp_path, ONLY_A)
        load_team_names(session, directory)

        assert check_team_names(session, directory).is_clean

    def test_check_detects_drift(self, session, tmp_path):
        directory = seed_dir(tmp_path, ONLY_A)
        load_team_names(session, directory)

        drifted = seed_dir(tmp_path, '"NAME-A" = "别的名字"\n')
        report = check_team_names(session, drifted)

        assert not report.is_clean
        assert any("NAME-A" in entry for entry in report.changed)

    def test_check_writes_nothing(self, session, tmp_path):
        directory = seed_dir(tmp_path, ONLY_A)

        check_team_names(session, directory)

        session.expire_all()
        assert team(session, "NAME-A").display_name is None


class TestCommandLine:
    def test_check_prints_a_chinese_report_on_a_cp1252_stdout(
        self, session, tmp_path, monkeypatch
    ):
        """The report is in Chinese; a Windows console is often cp1252.

        Without the stdout fix the command does all its work and then dies
        printing the result — the worst shape of failure, because it looks
        like the import broke when it had already finished.
        """
        from app.seeds.team_names import main

        directory = seed_dir(tmp_path, '"NAME-GHOST" = "幽灵队"\n')
        stream = io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="strict")
        monkeypatch.setattr(sys, "stdout", stream)

        exit_code = main(["--check", "--seed-dir", str(directory)])

        sys.stdout.flush()
        assert exit_code == 0  # unmatched entries are a concern, not a failure

    def test_check_exits_nonzero_on_drift(self, session, tmp_path):
        from app.seeds.team_names import main

        directory = seed_dir(tmp_path, ONLY_A)

        assert main(["--check", "--seed-dir", str(directory)]) == 1
