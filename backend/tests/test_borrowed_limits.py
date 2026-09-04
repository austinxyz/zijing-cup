"""外援上场上限规则：按 division 存，随 seed 灌，可逐赛季/组别改数据而不改代码。

2026 银/金当前规则（联队学校数 → 名单上限 / 每场上场上限）：
  1 校 → 3 / 2
  2 校 → 2 / 1
  3 校 → 0 / 0
  4 校 → 0 / 0
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import shutil
from decimal import Decimal

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import (
    Division,
    DivisionBorrowedLimit,
    DivisionEligibilityLimit,
    DivisionLine,
    Season,
)
from app.seeds.load_rules import DEFAULT_SEED_DIR, load_rules


@pytest.fixture
def session():
    with Session(engine) as s:
        _truncate(s)
        yield s
        _truncate(s)


def _truncate(s: Session) -> None:
    s.execute(delete(DivisionBorrowedLimit))
    s.execute(delete(DivisionEligibilityLimit))
    s.execute(delete(DivisionLine))
    s.execute(delete(Division))
    s.execute(delete(Season))
    s.commit()


@pytest.fixture
def seed_dir(tmp_path):
    target = tmp_path / "rules"
    shutil.copytree(DEFAULT_SEED_DIR, target)
    return target


def _borrowed_map(session: Session, year: int, code: str) -> dict[int, tuple[int, int]]:
    division = session.exec(
        select(Division).where(Division.season_year == year, Division.code == code)
    ).one()
    rows = session.exec(
        select(DivisionBorrowedLimit).where(
            DivisionBorrowedLimit.division_id == division.id
        )
    ).all()
    return {r.school_count: (r.roster_cap, r.on_court_cap) for r in rows}


def test_silver_2026_borrowed_limits_seeded(session, seed_dir):
    load_rules(session, seed_dir)
    assert _borrowed_map(session, 2026, "silver") == {
        1: (3, 2),
        2: (2, 1),
        3: (0, 0),
        4: (0, 0),
    }


def test_gold_2026_borrowed_limits_seeded(session, seed_dir):
    load_rules(session, seed_dir)
    assert _borrowed_map(session, 2026, "gold") == {
        1: (3, 2),
        2: (2, 1),
        3: (0, 0),
        4: (0, 0),
    }


def test_on_court_cap_loader_reads_seeded_rule(session, seed_dir):
    from app.lineups.query import _borrowed_on_court_cap

    load_rules(session, seed_dir)
    # 2026 silver: 1 school → on-court 2, 2 schools → 1, 3 schools → 0.
    assert _borrowed_on_court_cap(session, 2026, "silver", 1) == 2
    assert _borrowed_on_court_cap(session, 2026, "silver", 2) == 1
    assert _borrowed_on_court_cap(session, 2026, "silver", 3) == 0
    # Unset school_count → None (do not enforce); unknown count → None.
    assert _borrowed_on_court_cap(session, 2026, "silver", None) is None
    assert _borrowed_on_court_cap(session, 2026, "silver", 9) is None


def test_load_roster_counts_only_confirmed_borrowed(session, seed_dir):
    # DB → Candidate.borrowed: only is_borrowed_player IS True counts. None
    # (unmarked) and False (confirmed not) both become borrowed=False, so a team
    # nobody has marked is not read as all-borrowed.
    from app.lineups.query import load_roster
    from app.models import Player, PlayerSeasonUtr, PlayerTeamMembership, Team

    load_rules(session, seed_dir)
    team = Team(season_year=2026, division_code="silver", code="BRW-联队")
    session.add(team)
    session.commit()
    session.refresh(team)

    marks = {"甲": True, "乙": None, "丙": False}
    for first, flag in marks.items():
        p = Player(last_name="援", first_name=first, gender="M")
        session.add(p)
        session.commit()
        session.refresh(p)
        session.add(PlayerSeasonUtr(player_id=p.id, season_year=2026, value=Decimal("6.00"), source="committee_sheet"))
        session.add(PlayerTeamMembership(player_id=p.id, team_id=team.id, is_borrowed_player=flag))
        session.commit()

    loaded = load_roster(session, 2026, "silver", "BRW-联队")
    by_name = {c.name.split("\t")[1]: c.borrowed for c in loaded.candidates}
    assert by_name == {"甲": True, "乙": False, "丙": False}

    # cleanup
    for c in loaded.candidates:
        pid = int(c.key[1:])
        session.execute(delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == pid))
        session.execute(delete(PlayerTeamMembership).where(PlayerTeamMembership.player_id == pid))
    session.commit()
    for p in session.exec(select(Player).where(Player.last_name == "援")).all():
        session.delete(p)
    session.delete(team)
    session.commit()


def test_check_detects_borrowed_limit_drift(session, seed_dir):
    # Drift detection must inspect borrowed_limits, else --check reports clean
    # while an import would write (the exact failure --check exists to prevent).
    from app.seeds.load_rules import check_rules, load_rules

    load_rules(session, seed_dir)
    assert check_rules(session, seed_dir).is_clean

    # Change one on_court_cap in the seed and re-check: must be dirty.
    silver = seed_dir / "2026-silver.toml"
    silver.write_text(
        silver.read_text(encoding="utf-8").replace(
            "school_count = 1\nroster_cap = 3\non_court_cap = 2",
            "school_count = 1\nroster_cap = 3\non_court_cap = 1",
        ),
        encoding="utf-8",
    )
    assert not check_rules(session, seed_dir).is_clean


def test_team_school_count_defaults_null_not_zero(session, seed_dir):
    from app.models import Team

    load_rules(session, seed_dir)  # teams FK (season_year, division_code) → divisions
    team = Team(season_year=2026, division_code="silver", code="TEST-联队")
    session.add(team)
    session.commit()
    session.refresh(team)
    # None means "nobody set it" — NOT zero schools. The engine keys off exactly
    # this distinction (null → do not enforce the borrowed limit).
    assert team.school_count is None

    team.school_count = 2
    session.add(team)
    session.commit()
    session.refresh(team)
    assert team.school_count == 2
    session.delete(team)
    session.commit()
