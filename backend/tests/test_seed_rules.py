"""The seed importer: the seed files are the source of truth, the database is
a projection of them.

Two properties matter more than "it inserts rows":

- Idempotence. Re-running must not duplicate or churn anything, because this
  runs on every deploy.
- Honest drift detection. `--check` has to answer "does the database match
  the files?" using the SAME comparison the writer uses. If they diverge,
  --check can report clean while an import would write — which is the exact
  failure the mode exists to prevent.
"""

import os
import shutil
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import Division, DivisionEligibilityLimit, DivisionLine, Season
from app.seeds.load_rules import (
    DEFAULT_SEED_DIR,
    check_rules,
    load_rules,
    main,
    parse_seed_dir,
)


@pytest.fixture
def session():
    with Session(engine) as s:
        _truncate(s)
        yield s
        _truncate(s)


def _truncate(s: Session) -> None:
    s.execute(delete(DivisionEligibilityLimit))
    s.execute(delete(DivisionLine))
    s.execute(delete(Division))
    s.execute(delete(Season))
    s.commit()


@pytest.fixture
def seed_dir(tmp_path):
    """A writable copy of the real seeds, so drift tests can edit one."""
    target = tmp_path / "rules"
    shutil.copytree(DEFAULT_SEED_DIR, target)
    return target


def _division(session: Session, year: int, code: str) -> Division:
    return session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == code
        )
    ).one()


def _lines(session: Session, division: Division) -> dict[str, DivisionLine]:
    rows = session.exec(
        select(DivisionLine).where(DivisionLine.division_id == division.id)
    ).all()
    return {line.code: line for line in rows}


def test_import_into_empty_database_loads_all_four_rule_sets(session, seed_dir):
    load_rules(session, seed_dir)

    divisions = session.exec(select(Division)).all()
    assert {(d.season_year, d.code) for d in divisions} == {
        (2025, "silver"),
        (2025, "gold"),
        (2026, "silver"),
        (2026, "gold"),
    }


def test_silver_2026_caps_match_the_published_rules(session, seed_dir):
    load_rules(session, seed_dir)

    lines = _lines(session, _division(session, 2026, "silver"))
    assert {code: line.cap for code, line in lines.items()} == {
        "D1": Decimal("13.00"),
        "D2": Decimal("12.00"),
        "D3": Decimal("11.00"),
        "MD": Decimal("10.25"),
        "WD": Decimal("9.25"),
    }


def test_gold_open_lines_have_no_cap_and_score_one_point(session, seed_dir):
    load_rules(session, seed_dir)

    lines = _lines(session, _division(session, 2026, "gold"))
    assert lines["D1"].cap is None
    assert lines["MD"].cap is None
    assert lines["D2"].cap == Decimal("15.00")

    # 1/2/2/1/2 = 8 points total.
    assert {code: line.points for code, line in lines.items()} == {
        "D1": 1,
        "D2": 2,
        "D3": 2,
        "MD": 1,
        "WD": 2,
    }
    assert sum(line.points for line in lines.values()) == 8


def test_2025_predates_the_buffer_system(session, seed_dir):
    load_rules(session, seed_dir)

    for code in ("silver", "gold"):
        division = _division(session, 2025, code)
        assert division.buffer_per_line == Decimal("0")
        assert division.buffer_total == Decimal("0")

    # And 2026 has it.
    assert _division(session, 2026, "silver").buffer_total == Decimal("0.50")
    assert _division(session, 2026, "gold").buffer_total == Decimal("0.30")


def test_scoring_mode_differs_by_division_and_season(session, seed_dir):
    load_rules(session, seed_dir)

    # Points scoring is gold-2026-onward only; gold 2025 still counted wins.
    assert _division(session, 2026, "gold").scoring_mode == "points"
    assert _division(session, 2025, "gold").scoring_mode == "match_count"
    assert _division(session, 2026, "silver").scoring_mode == "match_count"


def test_gold_eligibility_limit_carries_a_line_whitelist(session, seed_dir):
    load_rules(session, seed_dir)

    division = _division(session, 2026, "gold")
    limits = session.exec(
        select(DivisionEligibilityLimit).where(
            DivisionEligibilityLimit.division_id == division.id
        )
    ).all()
    by_threshold = {limit.utr_above: limit for limit in limits}

    top = by_threshold[Decimal("9.00")]
    assert top.max_players == 1
    assert top.restricted_to_lines == ["D1", "MD"]

    # The >8.0 rule is cumulative, not an exclusive band, and unrestricted.
    assert by_threshold[Decimal("8.00")].max_players == 3
    assert by_threshold[Decimal("8.00")].restricted_to_lines is None


def test_silver_eligibility_limits_are_unrestricted(session, seed_dir):
    load_rules(session, seed_dir)

    division = _division(session, 2026, "silver")
    limits = session.exec(
        select(DivisionEligibilityLimit).where(
            DivisionEligibilityLimit.division_id == division.id
        )
    ).all()

    assert {(l.gender, l.utr_above, l.max_players) for l in limits} == {
        ("M", Decimal("7.00"), 1),
        ("F", Decimal("5.50"), 1),
    }
    assert all(limit.restricted_to_lines is None for limit in limits)


# --------------------------------------------------------------------------
# Idempotence
# --------------------------------------------------------------------------


def _snapshot(session: Session) -> dict:
    """Everything that should be stable across a no-op re-import.

    Primary keys are part of the snapshot on purpose. Without them this
    compares only the *values*, and a re-import that deletes every child row
    and re-inserts an identical one would look untouched — which is exactly
    the churn idempotence is supposed to rule out. Identity columns never
    reuse a number, so a rewritten row shows up here as a changed id.
    """
    return {
        "divisions": sorted(
            (d.id, d.season_year, d.code, d.scoring_mode, str(d.buffer_total))
            for d in session.exec(select(Division)).all()
        ),
        "lines": sorted(
            (line.id, line.division_id, line.code, str(line.cap), line.points)
            for line in session.exec(select(DivisionLine)).all()
        ),
        "limits": sorted(
            (
                limit.id,
                limit.division_id,
                limit.gender,
                str(limit.utr_above),
                limit.max_players,
            )
            for limit in session.exec(select(DivisionEligibilityLimit)).all()
        ),
    }


def test_reimporting_the_same_seeds_changes_nothing(session, seed_dir):
    load_rules(session, seed_dir)
    session.expire_all()
    first = _snapshot(session)

    second_report = load_rules(session, seed_dir)
    session.expire_all()

    assert second_report.is_clean
    # The load-bearing assertion: identical primary keys prove no row was
    # deleted and re-inserted. Comparing values alone would pass even if the
    # importer rewrote everything on every run.
    assert _snapshot(session) == first


def test_reimporting_does_not_duplicate_rows(session, seed_dir):
    load_rules(session, seed_dir)
    load_rules(session, seed_dir)
    session.expire_all()

    assert len(session.exec(select(Division)).all()) == 4
    # 4 divisions x 5 lines
    assert len(session.exec(select(DivisionLine)).all()) == 20
    # silver 2 + gold 3, twice over
    assert len(session.exec(select(DivisionEligibilityLimit)).all()) == 10


def test_editing_one_cap_updates_only_that_line(session, seed_dir):
    load_rules(session, seed_dir)
    session.expire_all()
    before = _snapshot(session)

    path = seed_dir / "2026-silver.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace('cap = "10.25"', 'cap = "10.00"'),
        encoding="utf-8",
    )

    report = load_rules(session, seed_dir)
    session.expire_all()

    assert not report.is_clean
    lines = _lines(session, _division(session, 2026, "silver"))
    assert lines["MD"].cap == Decimal("10.00")

    # Every row belonging to a division the edit did not touch keeps its
    # primary key: the importer rewrote one division, not all four.
    after = _snapshot(session)
    assert len(after["lines"]) == len(before["lines"])

    # The edited division is replaced wholesale (see _write_division), so its
    # own child rows legitimately get new keys. Every OTHER division must be
    # physically untouched.
    edited_id = _division(session, 2026, "silver").id
    for kind in ("lines", "limits"):
        untouched_before = [row for row in before[kind] if row[1] != edited_id]
        untouched_after = [row for row in after[kind] if row[1] != edited_id]
        assert untouched_after == untouched_before, kind


def test_removing_a_seed_file_removes_that_rule_set(session, seed_dir):
    # The seeds are the source of truth, not an append-only log: a rule set
    # that disappears from the files has to disappear from the database, or
    # a division deleted upstream would linger forever.
    load_rules(session, seed_dir)
    (seed_dir / "2025-gold.toml").unlink()

    report = load_rules(session, seed_dir)
    session.expire_all()

    assert report.removed
    assert {(d.season_year, d.code) for d in session.exec(select(Division)).all()} == {
        (2025, "silver"),
        (2026, "silver"),
        (2026, "gold"),
    }


# --------------------------------------------------------------------------
# --check: drift detection
#
# The reason this mode exists: a rule edited in a seed file but never imported
# means the lineup engine is running on last season's caps, and nothing about
# the system looks broken. CI runs this so the gap is caught at the commit
# that opened it.
# --------------------------------------------------------------------------


def test_check_exits_zero_when_database_matches_the_seeds(session, seed_dir):
    load_rules(session, seed_dir)

    assert main(["--check", "--seed-dir", str(seed_dir)]) == 0


def test_check_exits_nonzero_when_a_seed_was_edited_but_not_imported(
    session, seed_dir, capsys
):
    load_rules(session, seed_dir)

    path = seed_dir / "2026-silver.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace('cap = "9.25"', 'cap = "9.75"'),
        encoding="utf-8",
    )

    exit_code = main(["--check", "--seed-dir", str(seed_dir)])
    out = capsys.readouterr().out

    assert exit_code != 0
    # Naming the season, division and field is the difference between a
    # useful failure and "something differs, go find it across four files".
    assert "2026" in out
    assert "silver" in out
    assert "WD" in out
    assert "9.25" in out and "9.75" in out


def test_check_reports_a_rule_set_that_is_in_the_database_but_not_the_seeds(
    session, seed_dir, capsys
):
    load_rules(session, seed_dir)
    (seed_dir / "2025-gold.toml").unlink()

    exit_code = main(["--check", "--seed-dir", str(seed_dir)])
    out = capsys.readouterr().out

    assert exit_code != 0
    assert "2025" in out and "gold" in out


def test_check_writes_nothing_even_when_it_finds_drift(session, seed_dir):
    load_rules(session, seed_dir)
    session.expire_all()
    before = _snapshot(session)

    path = seed_dir / "2026-silver.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace('cap = "9.25"', 'cap = "9.75"'),
        encoding="utf-8",
    )

    assert main(["--check", "--seed-dir", str(seed_dir)]) != 0

    session.expire_all()
    assert _snapshot(session) == before


def test_check_and_import_agree_on_what_differs(session, seed_dir):
    """The two modes must share one comparison.

    If --check computed equality separately from the writer, it could report
    clean while an import would still write. Asserting they see the same
    difference set is what rules that out.
    """
    load_rules(session, seed_dir)

    path = seed_dir / "2026-gold.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace('cap = "15.00"', 'cap = "15.50"'),
        encoding="utf-8",
    )

    check_report = check_rules(session, seed_dir)
    load_report = load_rules(session, seed_dir)

    assert not check_report.is_clean
    assert check_report.changed == load_report.changed
    assert check_report.added == load_report.added
    assert check_report.removed == load_report.removed

    # And after importing, check is clean.
    assert check_rules(session, seed_dir).is_clean


def test_conflicting_season_metadata_is_rejected_at_parse_time(seed_dir):
    """Two divisions share one season row, so their season blocks must agree.

    Without this guard the importer never converges: each division's write
    sets the shared edition_name, the other division then reads back a value
    its file disagrees with, and every run flips it. --check would report
    drift forever, pointing at a field nobody edited.
    """
    path = seed_dir / "2026-gold.toml"
    path.write_text(
        path.read_text(encoding="utf-8").replace(
            'edition_name = "第十一届"', 'edition_name = "第 11 届"'
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError) as excinfo:
        parse_seed_dir(seed_dir)

    message = str(excinfo.value)
    assert "2026" in message
    # Name both spellings so the fix is obvious without opening the files.
    assert "第十一届" in message and "第 11 届" in message
