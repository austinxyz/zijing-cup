"""Writing requires an admin credential; reading does not.

This is the project's first write surface, so the shape of the check matters
more than the check itself. The existing shared-secret middleware is
SUBTRACTIVE: a route added tomorrow is protected because it did not opt out.
The admin check has to work the same way, because the failure mode of the
alternative — a FastAPI dependency someone forgets to attach — is a write
route that is quietly open.

The credential is keyed on the HTTP METHOD rather than a route prefix. A
prefix convention relies on whoever adds the next route remembering it; the
method is a property of the request itself.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import ADMIN_HEADER, SECRET_HEADER, require_shared_secret
from app.main import app

READ_AUTH = {SECRET_HEADER: "test-secret"}
WRITE_AUTH = {SECRET_HEADER: "test-secret", ADMIN_HEADER: "admin-secret"}


@pytest.fixture()
def probe() -> TestClient:
    """A throwaway app carrying only the middleware under test.

    Built here rather than mutating the real app: the point is to exercise a
    route that never declared anything about authentication, which is exactly
    what a future contributor will write.
    """
    probe_app = FastAPI()
    probe_app.middleware("http")(require_shared_secret)

    @probe_app.get("/probe")
    def read():
        return {"ok": True}

    @probe_app.post("/probe")
    def create():
        return {"ok": True}

    @probe_app.delete("/probe")
    def remove():
        return {"ok": True}

    return TestClient(probe_app)


class TestWritesNeedTheAdminSecret:
    def test_a_write_without_the_admin_header_is_refused(self, probe):
        response = probe.post("/probe", headers=READ_AUTH)
        assert response.status_code in (401, 403)

    def test_a_write_with_the_admin_header_goes_through(self, probe):
        assert probe.post("/probe", headers=WRITE_AUTH).status_code == 200

    def test_a_wrong_admin_header_is_refused(self, probe):
        response = probe.post(
            "/probe", headers={**READ_AUTH, ADMIN_HEADER: "not-it"}
        )
        assert response.status_code in (401, 403)

    def test_every_write_method_is_covered_not_just_post(self, probe):
        assert probe.delete("/probe", headers=READ_AUTH).status_code in (401, 403)
        assert probe.delete("/probe", headers=WRITE_AUTH).status_code == 200

    def test_a_route_that_declared_nothing_is_still_protected(self, probe):
        # The probe routes above attach no dependency and know nothing about
        # admin access. Coverage has to be subtractive or this is open.
        assert probe.post("/probe", headers=READ_AUTH).status_code in (401, 403)


class TestReadsAreUnaffected:
    def test_a_read_needs_only_the_shared_secret(self, probe):
        assert probe.get("/probe", headers=READ_AUTH).status_code == 200

    def test_a_read_still_needs_the_shared_secret(self, probe):
        assert probe.get("/probe").status_code == 401

    def test_the_real_read_routes_still_answer(self):
        client = TestClient(app)
        # /health is the one exempt path and must stay exempt: Render's own
        # health check cannot send a custom header.
        assert client.get("/health").status_code == 200


class TestAMissingSecretLocksEverybodyOut:
    def test_writes_are_refused_when_admin_secret_is_unset(self, probe, monkeypatch):
        monkeypatch.delenv("ADMIN_SECRET", raising=False)

        # Not "everyone gets in": an unset variable is a deployment mistake,
        # and the failure has to be closed. Even a request carrying some
        # plausible value is refused.
        assert probe.post("/probe", headers=WRITE_AUTH).status_code in (401, 403)
        assert probe.post(
            "/probe", headers={**READ_AUTH, ADMIN_HEADER: ""}
        ).status_code in (401, 403)

    def test_reads_still_work_when_only_admin_secret_is_unset(
        self, probe, monkeypatch
    ):
        monkeypatch.delenv("ADMIN_SECRET", raising=False)
        assert probe.get("/probe", headers=READ_AUTH).status_code == 200


def _write_operations() -> list[tuple[str, str]]:
    """Every (path, method) the real app exposes that changes data."""
    schema = app.openapi()
    return [
        (path, method.upper())
        for path, operations in schema["paths"].items()
        for method in operations
        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
    ]


class TestTheRealAppsWriteSurface:
    def test_the_guard_is_not_reading_an_empty_schema(self):
        # Keeps the assertion below from passing because the schema was empty.
        assert app.openapi()["paths"], "no routes registered at all"

    def test_every_write_route_refuses_a_request_without_the_admin_secret(self):
        client = TestClient(app)
        for path, method in _write_operations():
            # Path params left as their literal template: the credential check
            # runs in middleware, before routing resolves them, so a 401/403 is
            # what we expect regardless of whether the resource exists.
            response = client.request(method, path, headers=READ_AUTH)
            assert response.status_code in (401, 403), (
                f"{method} {path} answered {response.status_code} without an "
                "admin credential"
            )
