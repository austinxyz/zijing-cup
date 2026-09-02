"""Saved filter presets: store, list, overwrite, delete, limits.

Hits the local Postgres via `engine` (same as the other API tests). A module
fixture builds one season/division/team to hang presets on and tears it down.
"""

import os
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import ADMIN_HEADER, SECRET_HEADER
from app.db import engine
from app.main import app
from app.models import Division, Season, Team

READ_AUTH = {SECRET_HEADER: "test-secret"}
WRITE_AUTH = {SECRET_HEADER: "test-secret", ADMIN_HEADER: "admin-secret"}
BASE = f"/api/seasons/{{year}}/divisions/silver/teams/PRE-A/presets"
from app.lineups.presets import (
    InvalidPreset,
    MAX_PRESETS_PER_TEAM,
    PresetLimitExceeded,
    delete_preset,
    list_presets,
    save_preset,
)

TEST_YEAR = 2093  # far from any seed year so cleanup cannot touch real data


def _cleanup(session: Session) -> None:
    for team in session.exec(
        select(Team).where(Team.season_year == TEST_YEAR)
    ).all():
        session.delete(team)
    for division in session.exec(
        select(Division).where(Division.season_year == TEST_YEAR)
    ).all():
        session.delete(division)
    season = session.get(Season, TEST_YEAR)
    if season is not None:
        session.delete(season)
    session.commit()


@pytest.fixture()
def team_id():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="preset 测试赛季"))
        session.commit()
        session.add(Division(
            season_year=TEST_YEAR, code="silver", display_name="银组",
            scoring_mode="match_count", buffer_per_line=Decimal("0.5"),
            buffer_total=Decimal("0.5"), partner_gap_max=Decimal("3.50"),
        ))
        session.commit()
        team = Team(season_year=TEST_YEAR, division_code="silver", code="PRE-A")
        session.add(team)
        session.commit()
        session.refresh(team)
        tid = team.id
    yield tid
    with Session(engine) as session:
        _cleanup(session)


def _constraints(locks=None, excluded=None):
    return {"locks": locks or {}, "excluded": excluded or []}


class TestSaveAndList:
    def test_save_then_list_returns_it(self, team_id):
        with Session(engine) as session:
            save_preset(
                session, team_id, "主力阵",
                _constraints(locks={"D1": ["p1", "p2"]}, excluded=["p3"]),
            )
            got = list_presets(session, team_id)
        assert len(got) == 1
        assert got[0].name == "主力阵"
        assert got[0].constraints["locks"]["D1"] == ["p1", "p2"]
        assert got[0].constraints["excluded"] == ["p3"]


class TestOverwriteAndEmptyName:
    def test_same_name_overwrites(self, team_id):
        with Session(engine) as session:
            save_preset(session, team_id, "主力阵", _constraints(excluded=["p1"]))
            save_preset(session, team_id, "主力阵", _constraints(excluded=["p2"]))
            got = list_presets(session, team_id)
        assert len(got) == 1
        assert got[0].constraints["excluded"] == ["p2"]

    def test_empty_name_rejected(self, team_id):
        with Session(engine) as session:
            with pytest.raises(InvalidPreset):
                save_preset(session, team_id, "", _constraints(excluded=["p1"]))
            got = list_presets(session, team_id)
        assert got == []


class TestDelete:
    def test_delete_removes_it(self, team_id):
        with Session(engine) as session:
            a = save_preset(session, team_id, "甲", _constraints(excluded=["p1"]))
            save_preset(session, team_id, "乙", _constraints(excluded=["p2"]))
            delete_preset(session, team_id, a.id)
            names = [p.name for p in list_presets(session, team_id)]
        assert names == ["乙"]

    def test_delete_missing_is_quiet(self, team_id):
        with Session(engine) as session:
            # No such id — must not raise, must not remove anything else.
            delete_preset(session, team_id, 99999999)
            assert list_presets(session, team_id) == []


class TestLimits:
    def test_name_too_long_rejected(self, team_id):
        with Session(engine) as session:
            with pytest.raises(InvalidPreset):
                save_preset(session, team_id, "x" * 61, _constraints(excluded=["p1"]))
            assert list_presets(session, team_id) == []

    def test_per_team_count_capped(self, team_id):
        with Session(engine) as session:
            for i in range(MAX_PRESETS_PER_TEAM):
                save_preset(session, team_id, f"p{i}", _constraints(excluded=["p1"]))
            with pytest.raises(PresetLimitExceeded):
                save_preset(session, team_id, "one-too-many", _constraints(excluded=["p1"]))
            assert len(list_presets(session, team_id)) == MAX_PRESETS_PER_TEAM

    def test_overwrite_at_cap_still_allowed(self, team_id):
        # Re-saving an existing name is an update, not a new row, so it must not
        # trip the count cap.
        with Session(engine) as session:
            for i in range(MAX_PRESETS_PER_TEAM):
                save_preset(session, team_id, f"p{i}", _constraints(excluded=["p1"]))
            save_preset(session, team_id, "p0", _constraints(excluded=["p2"]))
            got = {p.name: p for p in list_presets(session, team_id)}
        assert len(got) == MAX_PRESETS_PER_TEAM
        assert got["p0"].constraints["excluded"] == ["p2"]


class TestRoutes:
    def _url(self):
        return BASE.format(year=TEST_YEAR)

    def test_list_needs_no_admin_and_load_roundtrips(self, team_id):
        client = TestClient(app)
        url = self._url()
        # Save (admin) then list (read-only, no admin header).
        created = client.post(
            url,
            headers=WRITE_AUTH,
            json={"name": "主力阵", "constraints": _constraints(excluded=["p1"])},
        )
        assert created.status_code == 201, created.text
        listed = client.get(url, headers=READ_AUTH)
        assert listed.status_code == 200
        body = listed.json()
        assert [p["name"] for p in body] == ["主力阵"]
        assert body[0]["constraints"]["excluded"] == ["p1"]

    def test_save_without_admin_is_refused(self, team_id):
        client = TestClient(app)
        resp = client.post(
            self._url(),
            headers=READ_AUTH,
            json={"name": "x", "constraints": _constraints(excluded=["p1"])},
        )
        assert resp.status_code in (401, 403)
        # And nothing was written.
        assert client.get(self._url(), headers=READ_AUTH).json() == []

    def test_delete_without_admin_is_refused(self, team_id):
        client = TestClient(app)
        url = self._url()
        created = client.post(
            url, headers=WRITE_AUTH,
            json={"name": "甲", "constraints": _constraints(excluded=["p1"])},
        )
        pid = created.json()["id"]
        resp = client.request(
            "DELETE", f"{url}/{pid}", headers=READ_AUTH
        )
        assert resp.status_code in (401, 403)
        assert [p["name"] for p in client.get(url, headers=READ_AUTH).json()] == ["甲"]
