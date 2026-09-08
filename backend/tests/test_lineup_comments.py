"""Lineup comments (阵容评论) — append-only free-text notes on a saved lineup.

Symmetric to player notes: a captain records why a saved lineup is arranged the
way it is, who to use it against, which line to watch. Never edited in place —
the record is the sequence of remarks over time. So the contract is append +
list-descending + delete-one + a batch read for the saved-lineups screen.

Comments are attached to a saved_lineup (FK cascade): deleting the lineup
removes its comments. Cloning a lineup does NOT copy comments (a clone is a new
lineup to change; the comments annotate the original).

Auth is enforced in middleware by HTTP method: GET needs the shared secret,
POST/DELETE additionally need the admin secret.

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
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import (
    Division,
    LineupComment,
    SavedLineup,
    Season,
    Team,
)

TEST_YEAR = 2999
DIV = "gold"
READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}


def _purge(session: Session) -> None:
    for model in (LineupComment, SavedLineup, Team, Division, Season):
        session.exec(delete(model))
    session.commit()


@pytest.fixture()
def client():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="评论测试赛季"))
        session.commit()
        session.add(
            Division(
                season_year=TEST_YEAR,
                code=DIV,
                display_name="金组",
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
        session.commit()

    yield TestClient(app)

    with Session(engine) as session:
        _purge(session)


def make_saved_lineup(code: str = "TEAMA", name: str = "阵容一") -> tuple[int, str]:
    """Insert a Team + SavedLineup directly (bypassing the legality engine — the
    comment endpoints only need a row to attach to). Returns (saved_id, team_code)."""
    with Session(engine) as session:
        team = Team(season_year=TEST_YEAR, division_code=DIV, code=code)
        session.add(team)
        session.commit()
        session.refresh(team)
        saved = SavedLineup(
            team_id=team.id, name=name, assignment={"D1": ["p1", "p2"]},
            utr_snapshot={"p1": "6.00", "p2": "5.50"},
        )
        session.add(saved)
        session.commit()
        session.refresh(saved)
        return saved.id, code


def _base(team_code: str) -> str:
    return f"/api/seasons/{TEST_YEAR}/divisions/{DIV}/teams/{team_code}/saved-lineups"


class TestCommentsAppendAndList:
    def test_comments_are_appended_and_listed_newest_first(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"

        first = client.post(base, json={"body": "打 THU 用这套"}, headers=WRITE)
        assert first.status_code == 201, first.text
        second = client.post(base, json={"body": "D2 偏弱盯紧"}, headers=WRITE)
        assert second.status_code == 201, second.text

        listed = client.get(base, headers=READ)
        assert listed.status_code == 200, listed.text
        comments = listed.json()

        assert len(comments) == 2  # second did not overwrite first
        assert [c["body"] for c in comments] == ["D2 偏弱盯紧", "打 THU 用这套"]
        assert all(c["created_at"] for c in comments)
        assert all(isinstance(c["id"], int) for c in comments)


class TestCommentsValidation:
    def test_an_empty_body_is_rejected(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"
        for blank in ("", "   "):
            resp = client.post(base, json={"body": blank}, headers=WRITE)
            assert resp.status_code == 422, (blank, resp.text)
        assert client.get(base, headers=READ).json() == []

    def test_an_over_long_body_is_rejected_as_422_not_500(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"
        resp = client.post(base, json={"body": "国" * 2001}, headers=WRITE)
        assert resp.status_code == 422, resp.text


class TestCommentsDelete:
    def _add(self, client, base, body):
        r = client.post(base, json={"body": body}, headers=WRITE)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    def test_deleting_one_comment_leaves_the_rest(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"
        keep = self._add(client, base, "留着")
        drop = self._add(client, base, "删掉")

        resp = client.delete(f"{base}/{drop}", headers=WRITE)
        assert resp.status_code == 204, resp.text
        remaining = client.get(base, headers=READ).json()
        assert [c["id"] for c in remaining] == [keep]

    def test_deleting_a_nonexistent_comment_is_404(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"
        resp = client.delete(f"{base}/999999", headers=WRITE)
        assert resp.status_code == 404, resp.text

    def test_a_comment_of_a_different_lineup_cannot_be_deleted(self, client):
        a_id, a_code = make_saved_lineup(code="TEAMA", name="甲阵容")
        b_id, b_code = make_saved_lineup(code="TEAMB", name="乙阵容")
        base_a = f"{_base(a_code)}/{a_id}/comments"
        cid = self._add(client, base_a, "属于甲")
        # Correct comment id, wrong saved_lineup in the path — must not delete.
        base_b = f"{_base(b_code)}/{b_id}/comments"
        resp = client.delete(f"{base_b}/{cid}", headers=WRITE)
        assert resp.status_code == 404, resp.text
        assert len(client.get(base_a, headers=READ).json()) == 1

    def test_deleting_the_lineup_cascades_its_comments(self, client):
        saved_id, team_code = make_saved_lineup()
        base = f"{_base(team_code)}/{saved_id}/comments"
        self._add(client, base, "会被级联删掉")
        # Delete the saved_lineup row directly (bypassing the CRUD engine); the
        # FK cascade must remove its comments — not an app-side delete.
        with Session(engine) as session:
            row = session.get(SavedLineup, saved_id)
            session.delete(row)
            session.commit()
            leftover = session.exec(
                select(LineupComment).where(
                    LineupComment.saved_lineup_id == saved_id
                )
            ).all()
        assert leftover == []


class TestCommentsAuth:
    """The gate is middleware, by HTTP method: reads need the shared secret;
    writes additionally need the admin secret."""

    def test_listing_without_the_shared_secret_is_401(self, client):
        saved_id, team_code = make_saved_lineup()
        resp = client.get(f"{_base(team_code)}/{saved_id}/comments")
        assert resp.status_code == 401, resp.text

    def test_posting_without_the_admin_secret_is_403(self, client):
        saved_id, team_code = make_saved_lineup()
        resp = client.post(
            f"{_base(team_code)}/{saved_id}/comments",
            json={"body": "x"}, headers=READ,
        )
        assert resp.status_code == 403, resp.text

    def test_deleting_without_the_admin_secret_is_403(self, client):
        saved_id, team_code = make_saved_lineup()
        resp = client.delete(
            f"{_base(team_code)}/{saved_id}/comments/1", headers=READ
        )
        assert resp.status_code == 403, resp.text


class TestCommentsBatch:
    """Batch read for the saved-lineups screen: one round trip returns comments
    grouped by saved_lineup_id, newest first, only for ids that have comments."""

    def _add(self, client, base, body):
        r = client.post(base, json={"body": body}, headers=WRITE)
        assert r.status_code == 201, r.text

    def test_batch_groups_comments_by_lineup_newest_first(self, client):
        a_id, a_code = make_saved_lineup(code="TEAMA", name="甲")
        b_id, b_code = make_saved_lineup(code="TEAMB", name="乙")
        base_a = f"{_base(a_code)}/{a_id}/comments"
        base_b = f"{_base(b_code)}/{b_id}/comments"
        self._add(client, base_a, "a-旧")
        self._add(client, base_a, "a-新")
        self._add(client, base_b, "b-一条")

        resp = client.get(f"/api/lineup-comments?ids={a_id},{b_id}", headers=READ)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body.keys()) == {str(a_id), str(b_id)}
        assert [c["body"] for c in body[str(a_id)]] == ["a-新", "a-旧"]
        assert [c["body"] for c in body[str(b_id)]] == ["b-一条"]

    def test_batch_omits_ids_with_no_comments_and_handles_empty(self, client):
        a_id, a_code = make_saved_lineup(code="TEAMA", name="有")
        b_id, b_code = make_saved_lineup(code="TEAMB", name="无")  # no comments
        self._add(client, f"{_base(a_code)}/{a_id}/comments", "x")

        resp = client.get(
            f"/api/lineup-comments?ids={a_id},{b_id},999999", headers=READ
        )
        assert resp.status_code == 200, resp.text
        assert set(resp.json().keys()) == {str(a_id)}

    def test_batch_empty_ids_returns_empty_map(self, client):
        assert client.get("/api/lineup-comments", headers=READ).json() == {}
        assert client.get("/api/lineup-comments?ids=", headers=READ).json() == {}
        assert client.get("/api/lineup-comments?ids=abc,,", headers=READ).json() == {}

    def test_batch_clamps_id_count(self, client):
        many = ",".join(str(i) for i in range(1, 500))
        resp = client.get(f"/api/lineup-comments?ids={many}", headers=READ)
        assert resp.status_code == 200, resp.text

    def test_batch_without_backend_secret_is_401(self, client):
        resp = client.get("/api/lineup-comments?ids=1")
        assert resp.status_code == 401, resp.text


def test_batch_route_is_registered_before_id_routes():
    """The flat /api/lineup-comments must be a real registered path (not shadowed
    by a /{saved_id} param route). Assert against the OpenAPI paths — never walk
    app.routes (include_router hides sub-routes)."""
    paths = app.openapi()["paths"]
    assert "/api/lineup-comments" in paths
    assert "get" in paths["/api/lineup-comments"]
    # And the per-lineup comment routes exist too.
    comment_path = (
        "/api/seasons/{year}/divisions/{code}/teams/{team_code}"
        "/saved-lineups/{saved_id}/comments"
    )
    assert comment_path in paths


def test_parse_ids_dedupes_ignores_junk_and_keeps_first_within_cap():
    from app.routers.lineups import _BATCH_IDS_MAX, _parse_ids

    assert _parse_ids("3, 3 ,abc,,1,2,1") == [3, 1, 2]
    over = ",".join(str(i) for i in range(1, _BATCH_IDS_MAX + 51))
    parsed = _parse_ids(over)
    assert len(parsed) == _BATCH_IDS_MAX
    assert parsed[0] == 1 and parsed[-1] == _BATCH_IDS_MAX
