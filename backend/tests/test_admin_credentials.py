"""Per-competition admin password credentials: schema + read/write endpoints.

The model tests talk to the local Postgres (the thing under test is the table
and its unique constraint). The endpoint tests exercise the GET/PUT and their
auth via the shared-secret middleware. The hash is an opaque string here — it is
computed and checked only on the Next side; the backend just stores and returns
it.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select

from app.db import SCHEMA, engine

TEST_YEAR = 2097


def _columns(session: Session, table: str) -> dict[str, str]:
    rows = session.execute(
        __import__("sqlmodel").text(
            "select column_name, is_nullable from information_schema.columns "
            "where table_schema = :schema and table_name = :table"
        ),
        {"schema": SCHEMA, "table": table},
    )
    return {row[0]: row[1] for row in rows}


@pytest.fixture()
def session():
    with Session(engine) as s:
        from app.models import AdminCredential

        s.execute(delete(AdminCredential).where(AdminCredential.season_year == TEST_YEAR))
        s.commit()
        yield s
        s.execute(delete(AdminCredential).where(AdminCredential.season_year == TEST_YEAR))
        s.commit()


class TestSchema:
    def test_table_has_the_expected_columns(self, session):
        cols = _columns(session, "admin_credentials")
        assert "season_year" in cols
        assert "division_code" in cols
        assert cols.get("password_hash") == "NO"  # NOT NULL

    def test_one_row_per_competition(self, session):
        from app.models import AdminCredential

        session.add(AdminCredential(
            season_year=TEST_YEAR, division_code="silver", password_hash="a:b"))
        session.commit()
        session.add(AdminCredential(
            season_year=TEST_YEAR, division_code="silver", password_hash="c:d"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}


def _url(year=TEST_YEAR, code="silver"):
    return f"/api/seasons/{year}/divisions/{code}/admin-credential"


class TestEndpoints:
    def test_put_then_get_roundtrips_the_hash(self, session):
        client = TestClient(app)
        put = client.put(_url(), headers=WRITE, json={"password_hash": "salt1:hash1"})
        assert put.status_code in (200, 201), put.text
        got = client.get(_url(), headers=READ)
        assert got.status_code == 200
        assert got.json()["password_hash"] == "salt1:hash1"

    def test_get_missing_is_404(self, session):
        client = TestClient(app)
        assert client.get(_url(code="gold"), headers=READ).status_code == 404

    def test_put_is_upsert_not_duplicate(self, session):
        client = TestClient(app)
        client.put(_url(), headers=WRITE, json={"password_hash": "a:1"})
        client.put(_url(), headers=WRITE, json={"password_hash": "b:2"})
        got = client.get(_url(), headers=READ)
        assert got.json()["password_hash"] == "b:2"

    def test_get_needs_backend_secret(self, session):
        client = TestClient(app)
        assert client.get(_url(), headers={}).status_code == 401

    def test_put_needs_admin_secret(self, session):
        client = TestClient(app)
        r = client.put(_url(), headers=READ, json={"password_hash": "x:y"})
        assert r.status_code == 403
