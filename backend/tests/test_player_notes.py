"""Player notes — append-only scouting记录 (优点/弱点/搭档/其他).

A note is never edited in place: a captain's read of a player changes over
time, and the record is the sequence of those reads. So the contract is
append + list-descending + delete-one. Never an update.

Auth is enforced in middleware by HTTP method (see test_admin_auth.py): GET
needs the shared secret, POST/DELETE additionally need the admin secret. This
file tests the behaviour behind that gate.

All names are invented.
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
from sqlmodel import Session, delete

from app.db import engine
from app.main import app
from app.models import (
    Division,
    Player,
    PlayerNote,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    SeasonLock,
    Team,
)

TEST_YEAR = 2999
READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}


def _purge(session: Session) -> None:
    for model in (
        PlayerNote,
        PlayerSeasonUtr,
        PlayerTeamMembership,
        SeasonLock,
        Team,
        Player,
        Division,
        Season,
    ):
        session.exec(delete(model))
    session.commit()


@pytest.fixture()
def client():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="评价测试赛季"))
        session.commit()
        session.add(
            Division(
                season_year=TEST_YEAR,
                code="gold",
                display_name="金组",
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
        session.commit()

    yield TestClient(app)

    with Session(engine) as session:
        _purge(session)


def make_player(client: TestClient, **overrides) -> dict:
    payload = {"last_name": "评", "first_name": "价一", "gender": "M"}
    payload.update(overrides)
    response = client.post("/api/players", json=payload, headers=WRITE)
    assert response.status_code == 201, response.text
    return response.json()


class TestNotesAppendAndList:
    def test_notes_are_appended_and_listed_newest_first(self, client):
        player = make_player(client)
        pid = player["id"]

        first = client.post(
            f"/api/players/{pid}/notes",
            json={"category": "strength", "body": "正手很重"},
            headers=WRITE,
        )
        assert first.status_code == 201, first.text
        second = client.post(
            f"/api/players/{pid}/notes",
            json={"category": "weakness", "body": "反手薄弱"},
            headers=WRITE,
        )
        assert second.status_code == 201, second.text

        listed = client.get(f"/api/players/{pid}/notes", headers=READ)
        assert listed.status_code == 200, listed.text
        notes = listed.json()

        # Both survive — the second did not overwrite the first.
        assert len(notes) == 2
        # Newest first: the weakness was written last, so it comes first.
        assert [n["category"] for n in notes] == ["weakness", "strength"]
        assert [n["body"] for n in notes] == ["反手薄弱", "正手很重"]
        assert all(n["created_at"] for n in notes)


class TestNotesValidation:
    def test_an_unknown_category_is_rejected(self, client):
        pid = make_player(client)["id"]
        resp = client.post(
            f"/api/players/{pid}/notes",
            json={"category": "vibes", "body": "有something"},
            headers=WRITE,
        )
        assert resp.status_code == 422, resp.text

    def test_an_empty_body_is_rejected(self, client):
        pid = make_player(client)["id"]
        for blank in ("", "   "):
            resp = client.post(
                f"/api/players/{pid}/notes",
                json={"category": "other", "body": blank},
                headers=WRITE,
            )
            assert resp.status_code == 422, (blank, resp.text)
        # And nothing was written.
        listed = client.get(f"/api/players/{pid}/notes", headers=READ)
        assert listed.json() == []

    def test_an_over_long_body_is_rejected_as_422_not_500(self, client):
        # The DB CHECK caps body at 2000 chars; the API must reject longer input
        # as a 422 rather than letting the commit raise an IntegrityError 500.
        pid = make_player(client)["id"]
        resp = client.post(
            f"/api/players/{pid}/notes",
            json={"category": "other", "body": "国" * 2001},
            headers=WRITE,
        )
        assert resp.status_code == 422, resp.text


class TestNotesDelete:
    def _add(self, client, pid, category, body):
        resp = client.post(
            f"/api/players/{pid}/notes",
            json={"category": category, "body": body},
            headers=WRITE,
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def test_deleting_one_note_leaves_the_rest(self, client):
        pid = make_player(client)["id"]
        keep = self._add(client, pid, "strength", "留着")
        drop = self._add(client, pid, "weakness", "删掉")

        resp = client.delete(f"/api/players/{pid}/notes/{drop}", headers=WRITE)
        assert resp.status_code == 204, resp.text

        remaining = client.get(f"/api/players/{pid}/notes", headers=READ).json()
        assert [n["id"] for n in remaining] == [keep]

    def test_deleting_a_nonexistent_note_is_404(self, client):
        pid = make_player(client)["id"]
        resp = client.delete(f"/api/players/{pid}/notes/999999", headers=WRITE)
        assert resp.status_code == 404, resp.text

    def test_a_note_of_a_different_player_cannot_be_deleted(self, client):
        one = make_player(client, first_name="甲")["id"]
        two = make_player(client, first_name="乙")["id"]
        note = self._add(client, one, "other", "属于甲")
        # Correct note id, wrong player in the path — must not delete.
        resp = client.delete(f"/api/players/{two}/notes/{note}", headers=WRITE)
        assert resp.status_code == 404, resp.text
        assert len(client.get(f"/api/players/{one}/notes", headers=READ).json()) == 1


class TestNotesAuth:
    """The gate is middleware, by HTTP method. Confirm it covers these routes:
    reads need the shared secret; writes additionally need the admin secret."""

    def test_listing_without_the_shared_secret_is_401(self, client):
        pid = make_player(client)["id"]
        resp = client.get(f"/api/players/{pid}/notes")
        assert resp.status_code == 401, resp.text

    def test_posting_without_the_admin_secret_is_403(self, client):
        pid = make_player(client)["id"]
        resp = client.post(
            f"/api/players/{pid}/notes",
            json={"category": "other", "body": "x"},
            headers=READ,
        )
        assert resp.status_code == 403, resp.text

    def test_deleting_without_the_admin_secret_is_403(self, client):
        pid = make_player(client)["id"]
        resp = client.delete(f"/api/players/{pid}/notes/1", headers=READ)
        assert resp.status_code == 403, resp.text
