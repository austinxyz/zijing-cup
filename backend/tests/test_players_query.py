"""Filter dimensions for the player workbench: gender, team (fuzzy), year (either).

Builds an isolated dataset under reserved years (1991/1993/1994) with a unique
name/code prefix so assertions can intersect against ONLY these rows — the local
database may also hold real seeded players. All rows are purged after.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import (
    Division,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    Team,
)
from app.players.query import count_players, list_players

PREFIX = "WBQ_"  # workbench-query marker on every player + team this test owns
PKU_NAME = "紫荆测试北大ZZZ"  # unique display_name so team="紫荆测试北大" hits only ours
YEARS = (1991, 1993, 1994)


def _purge(session: Session) -> None:
    teams = session.exec(select(Team).where(Team.code.like(f"{PREFIX}%"))).all()
    team_ids = [t.id for t in teams]
    players = session.exec(
        select(Player).where(Player.last_name.like(f"{PREFIX}%"))
    ).all()
    pids = [p.id for p in players]
    if pids:
        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id.in_(pids)
            )
        )
        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id.in_(pids))
        )
    if team_ids:
        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.team_id.in_(team_ids)
            )
        )
    session.commit()
    for t in teams:
        session.delete(t)
    for p in players:
        session.delete(p)
    session.commit()
    for y in YEARS:
        session.execute(delete(Division).where(Division.season_year == y))
        session.execute(delete(Season).where(Season.year == y))
    session.commit()


def _season(session: Session, year: int) -> None:
    if session.get(Season, year) is None:
        session.add(Season(year=year, edition_name=f"WBQ-{year}"))
        session.commit()
        session.add(
            Division(
                season_year=year,
                code="silver",
                display_name="银组",
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
        session.commit()


def _team(session: Session, code: str, year: int, display_name=None) -> Team:
    t = Team(
        season_year=year, division_code="silver", code=code, display_name=display_name
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


def _player(session: Session, tag: str, gender) -> Player:
    p = Player(last_name=f"{PREFIX}{tag}", first_name="T", gender=gender)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def _member(session: Session, player: Player, team: Team) -> None:
    session.add(PlayerTeamMembership(player_id=player.id, team_id=team.id))
    session.commit()


def _sutr(session: Session, player: Player, year: int, value: str) -> None:
    session.add(
        PlayerSeasonUtr(
            player_id=player.id, season_year=year, value=Decimal(value), source="committee_sheet"
        )
    )
    session.commit()


class Data:
    def __init__(self, **ids):
        self.__dict__.update(ids)


@contextmanager
def _build():
    with Session(engine) as session:
        _purge(session)
        for y in YEARS:
            _season(session, y)

        pku = _team(session, f"{PREFIX}PKU", 1993, display_name=PKU_NAME)
        thu = _team(session, f"{PREFIX}THU", 1993, display_name="清华测试队")
        t94 = _team(session, f"{PREFIX}T94", 1994, display_name="九四队")
        told = _team(session, f"{PREFIX}OLD", 1991, display_name="旧队")

        # pf: F, PKU(1993), season_utr 1993
        pf = _player(session, "PF", "F")
        _member(session, pf, pku)
        _sutr(session, pf, 1993, "6.00")
        # pm: M, THU(1993), season_utr 1993
        pm = _player(session, "PM", "M")
        _member(session, pm, thu)
        _sutr(session, pm, 1993, "7.00")
        # putr_only: M, membership OLD(1991), season_utr 1994 → year=1994 via utr
        putr = _player(session, "PUTR", "M")
        _member(session, putr, told)
        _sutr(session, putr, 1994, "6.50")
        # pmem_only: F, membership T94(1994), season_utr 1991 → year=1994 via team
        pmem = _player(session, "PMEM", "F")
        _member(session, pmem, t94)
        _sutr(session, pmem, 1991, "5.00")
        # pneither: M, membership OLD(1991), season_utr 1991 → year=1994 excluded
        pnei = _player(session, "PNEI", "M")
        _member(session, pnei, told)
        _sutr(session, pnei, 1991, "5.50")

        try:
            yield session, Data(
                pf=pf.id, pm=pm.id, putr=putr.id, pmem=pmem.id, pnei=pnei.id
            )
        finally:
            _purge(session)


def _ours(rows, d) -> set[int]:
    owned = {d.pf, d.pm, d.putr, d.pmem, d.pnei}
    return {r.id for r in rows} & owned


@pytest.fixture
def wb():
    with _build() as (session, d):
        yield session, d


def test_gender_filter_exact(wb):
    session, d = wb
    rows = list_players(session, gender="F", limit=1000)
    assert _ours(rows, d) == {d.pf, d.pmem}


def test_team_fuzzy_matches_display_name(wb):
    session, d = wb
    rows = list_players(session, team="紫荆测试北大", limit=1000)
    assert _ours(rows, d) == {d.pf}


def test_team_fuzzy_matches_code(wb):
    session, d = wb
    rows = list_players(session, team=f"{PREFIX}THU", limit=1000)
    assert _ours(rows, d) == {d.pm}


def test_year_either_utr_or_membership(wb):
    session, d = wb
    rows = list_players(session, year=1994, limit=1000)
    # putr via season_utr(1994), pmem via membership team(1994); pnei is 1991-only
    assert _ours(rows, d) == {d.putr, d.pmem}


def test_year_and_gender_combine(wb):
    session, d = wb
    rows = list_players(session, gender="F", year=1994, limit=1000)
    assert _ours(rows, d) == {d.pmem}


def test_count_matches_list_and_ignores_limit(wb):
    session, d = wb
    # Unique display_name → only our PKU team; count must equal the one member.
    assert count_players(session, team="紫荆测试北大") == 1
    rows = list_players(session, team="紫荆测试北大", limit=1)
    assert {r.id for r in rows} == {d.pf}
