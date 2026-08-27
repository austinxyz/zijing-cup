import os
from unittest.mock import patch

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_ok_when_db_reachable():
    with patch("app.main.check_db_connection", return_value=True):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_reports_db_error_without_failing_the_request():
    # A DB outage should still return 200 with db:"error", not 500 — /health
    # is what Render polls to decide whether to keep the instance up, and a
    # 5xx here would restart a process that is otherwise serving fine.
    with patch("app.main.check_db_connection", return_value=False):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "error"}


def test_health_needs_no_secret_header():
    # Render's own platform health check cannot send our custom header, so
    # /health must be the one route exempt from the shared-secret gate.
    with patch("app.main.check_db_connection", return_value=True):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200


def test_missing_secret_is_rejected_on_other_routes():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 401


def test_correct_secret_reaches_routing_on_other_routes():
    client = TestClient(app)
    response = client.get("/", headers={"X-Backend-Secret": "test-secret"})
    # No route is registered at "/" yet in this bootstrap — 404 here proves
    # the middleware let the request through to FastAPI's router instead of
    # blocking it, which is the only thing this test needs to show.
    assert response.status_code == 404
