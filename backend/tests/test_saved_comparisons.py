"""Saved opponent comparisons: store a (team_a+lineup_a vs team_b+lineup_b)
reference under a name, per (season, division); per-line notes in a JSONB map.

Stores references (team codes + saved_lineup ids as plain ints — NO FK, so a
deleted lineup leaves the comparison standing) not a snapshot. Writes are
guarded by the shared-secret admin middleware (keyed on HTTP method); the list
read is behind the backend secret.

All names/ids invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import Division, DivisionLine, Season
from app.models.saved import SavedLineup  # noqa: F401  (table registration)

TEST_YEAR = 2999
DIV = "gold"
READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}
BASE = f"/api/seasons/{TEST_YEAR}/divisions/{DIV}/comparisons"


def _purge(session: Session) -> None:
    from app.models import SavedComparison  # imported lazily until it exists

    for model in (SavedComparison, DivisionLine, Division, Season):
        session.exec(delete(model))
    session.commit()


@pytest.fixture()
def client():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="对比测试赛季"))
        session.commit()
        div = Division(
            season_year=TEST_YEAR, code=DIV, display_name="金组",
            scoring_mode="points", partner_gap_max=Decimal("3.50"),
        )
        session.add(div)
        session.commit()
        session.refresh(div)
        for code, kind, order in (("D1", "mens_doubles", 1), ("MD", "mixed_doubles", 4)):
            session.add(DivisionLine(
                division_id=div.id, code=code, kind=kind, sort_order=order, points=1,
            ))
        session.commit()
    yield TestClient(app)
    with Session(engine) as session:
        _purge(session)


def _mk(name="打 THU 预案", la=101, lb=202):
    return {
        "name": name, "team_a_code": "UCSD-ZJU-UCB", "lineup_a_id": la,
        "team_b_code": "THU-MIT", "lineup_b_id": lb,
    }


class TestSaveAndList:
    def test_save_stores_one_row_with_references(self, client):
        resp = client.post(BASE, headers=WRITE, json=_mk())
        assert resp.status_code in (200, 201), resp.text
        body = resp.json()
        assert body["team_a_code"] == "UCSD-ZJU-UCB"
        assert body["lineup_a_id"] == 101
        assert body["line_notes"] == {}

        lst = client.get(BASE, headers=READ)
        assert lst.status_code == 200
        rows = lst.json()
        assert len(rows) == 1
        assert rows[0]["name"] == "打 THU 预案"

    def test_same_name_overwrites(self, client):
        client.post(BASE, headers=WRITE, json=_mk(la=1, lb=2))
        client.post(BASE, headers=WRITE, json=_mk(la=9, lb=8))
        rows = client.get(BASE, headers=READ).json()
        assert len(rows) == 1
        assert rows[0]["lineup_a_id"] == 9

    def test_empty_name_rejected(self, client):
        resp = client.post(BASE, headers=WRITE, json=_mk(name="   "))
        assert resp.status_code == 422, resp.text

    def test_oversized_name_rejected(self, client):
        resp = client.post(BASE, headers=WRITE, json=_mk(name="x" * 61))
        assert resp.status_code == 422, resp.text

    def test_per_division_limit(self, client):
        for i in range(50):
            r = client.post(BASE, headers=WRITE, json=_mk(name=f"c{i}"))
            assert r.status_code in (200, 201), r.text
        over = client.post(BASE, headers=WRITE, json=_mk(name="c50"))
        assert over.status_code == 409, over.text

    def test_list_needs_backend_secret(self, client):
        assert client.get(BASE).status_code == 401


class TestLineNotesAndDelete:
    def _one(self, client):
        return client.post(BASE, headers=WRITE, json=_mk()).json()["id"]

    def test_set_line_note_stored(self, client):
        cid = self._one(client)
        r = client.post(f"{BASE}/{cid}/line-note", headers=WRITE,
                        json={"line_code": "D1", "text": "我方略强"})
        assert r.status_code in (200, 201), r.text
        rows = client.get(BASE, headers=READ).json()
        assert rows[0]["line_notes"]["D1"] == "我方略强"

    def test_clear_line_note_removes_key(self, client):
        cid = self._one(client)
        client.post(f"{BASE}/{cid}/line-note", headers=WRITE,
                    json={"line_code": "D1", "text": "x"})
        client.post(f"{BASE}/{cid}/line-note", headers=WRITE,
                    json={"line_code": "D1", "text": "  "})
        rows = client.get(BASE, headers=READ).json()
        assert "D1" not in rows[0]["line_notes"]

    def test_line_note_unknown_line_rejected(self, client):
        cid = self._one(client)
        r = client.post(f"{BASE}/{cid}/line-note", headers=WRITE,
                        json={"line_code": "ZZ", "text": "x"})
        assert r.status_code == 422, r.text

    def test_delete_removes_row(self, client):
        cid = self._one(client)
        d = client.delete(f"{BASE}/{cid}", headers=WRITE)
        assert d.status_code == 204, d.text
        assert client.get(BASE, headers=READ).json() == []

    def test_save_needs_admin(self, client):
        assert client.post(BASE, headers=READ, json=_mk()).status_code == 403

    def test_line_note_needs_admin(self, client):
        cid = self._one(client)
        r = client.post(f"{BASE}/{cid}/line-note", headers=READ,
                        json={"line_code": "D1", "text": "x"})
        assert r.status_code == 403

    def test_delete_needs_admin(self, client):
        cid = self._one(client)
        assert client.delete(f"{BASE}/{cid}", headers=READ).status_code == 403
