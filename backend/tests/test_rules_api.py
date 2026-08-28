"""The read-only rules endpoint.

One request has to answer everything the rules page shows, because the page
is a Server Component doing one fetch: line definitions with their caps and
points, both buffer allowances, the eligibility limits, the scoring mode and
the shared lineup constraints.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.db import engine
from app.main import app
from app.models import Division, DivisionEligibilityLimit, DivisionLine, Season
from app.seeds.load_rules import load_rules

AUTH = {"X-Backend-Secret": "test-secret"}


@pytest.fixture(scope="module")
def client():
    # Load the real seeds once: the endpoint's job is to serve the published
    # rules, and hand-built fixtures would let the shape drift from what the
    # importer actually writes.
    with Session(engine) as session:
        session.execute(delete(DivisionEligibilityLimit))
        session.execute(delete(DivisionLine))
        session.execute(delete(Division))
        session.execute(delete(Season))
        session.commit()
        load_rules(session)

    yield TestClient(app)


def get_rules(client: TestClient, year: int, code: str):
    return client.get(f"/api/seasons/{year}/divisions/{code}/rules", headers=AUTH)


def test_returns_the_full_rule_set_for_a_division(client):
    response = get_rules(client, 2026, "silver")
    assert response.status_code == 200

    body = response.json()
    assert body["season"]["year"] == 2026
    assert body["division"]["code"] == "silver"
    assert body["division"]["display_name"] == "银组"
    assert body["division"]["scoring_mode"] == "match_count"


def test_lines_come_back_in_playing_order_with_caps(client):
    body = get_rules(client, 2026, "silver").json()

    assert [line["code"] for line in body["lines"]] == ["D1", "D2", "D3", "MD", "WD"]
    assert [line["cap"] for line in body["lines"]] == [
        "13.00",
        "12.00",
        "11.00",
        "10.25",
        "9.25",
    ]


def test_open_lines_serialise_as_null_not_a_sentinel(client):
    body = get_rules(client, 2026, "gold").json()
    by_code = {line["code"]: line for line in body["lines"]}

    # A JSON consumer must be able to tell "no ceiling" from "a high ceiling".
    assert by_code["D1"]["cap"] is None
    assert by_code["MD"]["cap"] is None
    assert by_code["D2"]["cap"] == "15.00"


def test_line_points_are_included_for_the_points_scoring_division(client):
    body = get_rules(client, 2026, "gold").json()

    assert body["division"]["scoring_mode"] == "points"
    assert {line["code"]: line["points"] for line in body["lines"]} == {
        "D1": 1,
        "D2": 2,
        "D3": 2,
        "MD": 1,
        "WD": 2,
    }


def test_both_buffer_allowances_are_exposed_separately(client):
    silver = get_rules(client, 2026, "silver").json()["division"]
    gold = get_rules(client, 2026, "gold").json()["division"]

    assert silver["buffer_per_line"] == "0.50"
    assert silver["buffer_total"] == "0.50"
    assert gold["buffer_per_line"] == "0.30"
    assert gold["buffer_total"] == "0.30"


def test_shared_lineup_constraints_are_exposed(client):
    division = get_rules(client, 2026, "silver").json()["division"]

    assert division["partner_gap_max"] == "3.50"
    assert division["mens_doubles_must_be_ordered"] is True


def test_eligibility_limits_include_the_line_whitelist(client):
    body = get_rules(client, 2026, "gold").json()
    by_threshold = {limit["utr_above"]: limit for limit in body["eligibility_limits"]}

    assert by_threshold["9.00"]["max_players"] == 1
    assert by_threshold["9.00"]["restricted_to_lines"] == ["D1", "MD"]
    assert by_threshold["8.00"]["restricted_to_lines"] is None


def test_a_past_season_serves_its_own_rules(client):
    body = get_rules(client, 2025, "silver").json()
    by_code = {line["code"]: line for line in body["lines"]}

    # The 2025 numbers, not this season's — this is what makes the "changed
    # since last season" comparison on the rules page possible.
    assert by_code["MD"]["cap"] == "10.50"
    assert by_code["WD"]["cap"] == "9.50"
    assert body["division"]["buffer_total"] == "0.00"


def test_unknown_season_is_404(client):
    assert get_rules(client, 1999, "silver").status_code == 404


def test_unknown_division_code_is_404(client):
    # Not an empty object and not a fallback to the other division: a URL
    # that names something that does not exist has to say so, or the page
    # would render someone else's rules under the wrong heading.
    assert get_rules(client, 2026, "bronze").status_code == 404


def test_endpoint_requires_the_shared_secret(client):
    response = client.get("/api/seasons/2026/divisions/silver/rules")
    assert response.status_code == 401


def _api_surface() -> dict[str, set[str]]:
    """Every path and method the app actually exposes.

    Read from the generated OpenAPI schema rather than app.routes: this
    FastAPI version keeps an included router as a single opaque entry in
    app.routes instead of flattening its APIRoutes, so walking that list
    silently sees no /api routes at all — and a "no write routes" assertion
    built on it would pass while the app served whatever it liked.
    """
    schema = app.openapi()
    return {
        path: {method.upper() for method in operations}
        for path, operations in schema["paths"].items()
    }


def test_the_read_route_is_registered_under_api():
    # Guards the assertion below from passing vacuously: if the router were
    # never mounted, "no write routes" would also be trivially true.
    assert "/api/seasons/{year}/divisions/{code}/rules" in _api_surface()


def test_no_write_route_exists_for_rules():
    """Rules are read-only over HTTP.

    They change once a year through a reviewed seed file and the importer.
    A write endpoint would be a second path to the same data that nobody
    reviews — and this app has no per-user auth to gate one with.
    """
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    offenders = {
        path: sorted(methods & write_methods)
        for path, methods in _api_surface().items()
        if methods & write_methods
    }

    assert offenders == {}
