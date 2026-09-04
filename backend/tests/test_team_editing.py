"""Team-page edit writes: membership flags (borrowed/wildcard/school), the
team's school_count, and the batch doubles-UTR write that mirrors participation
while a season is open."""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import (
    Division,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    SeasonLock,
    Team,
)

READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}
YEAR = 1991  # reserved for this module


def _purge(s: Session) -> None:
    teams = s.exec(select(Team).where(Team.season_year == YEAR)).all()
    for t in teams:
        s.execute(delete(PlayerTeamMembership).where(PlayerTeamMembership.team_id == t.id))
    s.execute(delete(PlayerSeasonUtr).where(PlayerSeasonUtr.season_year == YEAR))
    s.commit()
    for t in teams:
        s.delete(t)
    s.commit()
    s.execute(delete(SeasonLock).where(SeasonLock.season_year == YEAR))
    s.execute(delete(Division).where(Division.season_year == YEAR))
    s.execute(delete(Season).where(Season.year == YEAR))
    for p in s.exec(select(Player).where(Player.last_name == "编")).all():
        s.execute(delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == p.id))
        s.execute(delete(PlayerTeamMembership).where(PlayerTeamMembership.player_id == p.id))
        s.delete(p)
    s.commit()


@pytest.fixture()
def client():
    with Session(engine) as s:
        _purge(s)
        s.add(Season(year=YEAR, edition_name="编辑测试"))
        s.commit()
        s.add(Division(season_year=YEAR, code="silver", display_name="银组",
                       scoring_mode="match_count", partner_gap_max=Decimal("3.50")))
        s.commit()
        s.add(Team(season_year=YEAR, division_code="silver", code="EDIT-SILVER"))
        s.commit()
    yield TestClient(app)
    with Session(engine) as s:
        _purge(s)


def _team_id() -> int:
    with Session(engine) as s:
        return s.exec(select(Team).where(Team.season_year == YEAR, Team.code == "EDIT-SILVER")).one().id


def _player(client: TestClient, first: str) -> int:
    r = client.post("/api/players", json={"last_name": "编", "first_name": first, "gender": "M"}, headers=WRITE)
    assert r.status_code == 201
    return r.json()["id"]


def _add_member(client: TestClient, pid: int, tid: int) -> None:
    r = client.post(f"/api/players/{pid}/memberships", json={"team_id": tid}, headers=WRITE)
    assert r.status_code == 201


def _member(pid: int, tid: int) -> PlayerTeamMembership:
    with Session(engine) as s:
        return s.exec(select(PlayerTeamMembership).where(
            PlayerTeamMembership.player_id == pid, PlayerTeamMembership.team_id == tid)).one()


class TestMembershipFlags:
    def test_update_borrowed_wildcard(self, client):
        tid = _team_id(); pid = _player(client, "甲")
        _add_member(client, pid, tid)
        r = client.patch(f"/api/players/{pid}/memberships",
                         json={"team_id": tid, "is_borrowed_player": True, "is_wildcard": False},
                         headers=WRITE)
        assert r.status_code == 200
        m = _member(pid, tid)
        assert m.is_borrowed_player is True and m.is_wildcard is False

    def test_borrowed_clears_representing_school(self, client):
        tid = _team_id(); pid = _player(client, "乙")
        _add_member(client, pid, tid)
        client.patch(f"/api/players/{pid}/memberships",
                     json={"team_id": tid, "representing_school": "ZJU"}, headers=WRITE)
        # now mark borrowed — school must be cleared server-side
        client.patch(f"/api/players/{pid}/memberships",
                     json={"team_id": tid, "is_borrowed_player": True}, headers=WRITE)
        assert _member(pid, tid).representing_school is None

    def test_no_admin_secret_rejected(self, client):
        tid = _team_id(); pid = _player(client, "丙")
        _add_member(client, pid, tid)
        r = client.patch(f"/api/players/{pid}/memberships",
                         json={"team_id": tid, "is_borrowed_player": True}, headers=READ)
        assert r.status_code == 403


class TestSchoolCount:
    def test_write_and_read_school_count(self, client):
        r = client.patch("/api/seasons/1991/divisions/silver/teams/EDIT-SILVER",
                         json={"school_count": 2}, headers=WRITE)
        assert r.status_code == 200
        body = client.get("/api/seasons/1991/divisions/silver/teams/EDIT-SILVER/roster", headers=READ).json()
        assert body["school_count"] == 2

    def test_no_admin_rejected(self, client):
        r = client.patch("/api/seasons/1991/divisions/silver/teams/EDIT-SILVER",
                         json={"school_count": 2}, headers=READ)
        assert r.status_code == 403


class TestBatchDoublesOverwrite:
    def test_unlocked_doubles_mirrors_participation(self, client):
        pid = _player(client, "丁")
        r = client.put("/api/players/current-utr",
                       json={"season_year": YEAR, "updates": [{"player_id": pid, "doubles_utr": "6.40"}]},
                       headers=WRITE)
        assert r.status_code == 200
        with Session(engine) as s:
            row = s.exec(select(PlayerSeasonUtr).where(
                PlayerSeasonUtr.player_id == pid, PlayerSeasonUtr.season_year == YEAR)).one()
            assert row.value == Decimal("6.40")

    def test_locked_doubles_does_not_mirror(self, client):
        pid = _player(client, "戊")
        with Session(engine) as s:
            s.add(SeasonLock(season_year=YEAR)); s.commit()
        client.put("/api/players/current-utr",
                   json={"season_year": YEAR, "updates": [{"player_id": pid, "doubles_utr": "6.40"}]},
                   headers=WRITE)
        with Session(engine) as s:
            row = s.exec(select(PlayerSeasonUtr).where(
                PlayerSeasonUtr.player_id == pid, PlayerSeasonUtr.season_year == YEAR)).one_or_none()
            assert row is None  # locked → no participation written
