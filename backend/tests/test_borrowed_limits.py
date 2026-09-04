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
