"""The read-only roster endpoints.

Rosters change once a season through a reviewed CSV and the CLI. There is no
per-user login in this app, so a public write endpoint would let anyone
overwrite every team's roster — the absence of one is asserted here, not
merely intended.

All names are invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import Division, RosterEntry, Season, Team
from app.rosters.load import load_rosters

AUTH = {"X-Backend-Secret": "test-secret"}
TEST_YEAR = 1995  # reserved for this module

HEADER = (
    "Team,Last Name,First Name,Gender,DUTR Status,Match UTR,"
    "Verified DUTR 09/22,Verified DUTR 09/23,Notes"
)
ROWS = [
    "API-ALPHA,南,望舒,M,Rated,6.50,6.4,6.5,",
    "API-ALPHA,西,门吹雪,F,Unrated,4.00,,,Captain Provided UTR",
    "API-BETA,北,冥子,M,Projected,7.10,7.1,7.2,Zijing Cup 2024 UTR",
]


@pytest.fixture(scope="module")
def client():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="接口测试赛季"))
        session.commit()
        session.add(
            Division(
                season_year=TEST_YEAR,
                code="silver",
                display_name="银组",
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
        session.commit()
        load_rosters(
            session, "\n".join([HEADER, *ROWS]) + "\n", TEST_YEAR, "silver"
        )

        # One hand-set field, so the endpoint is exercised with the state the
        # importer deliberately never produces.
        entry = session.exec(
            select(RosterEntry).where(RosterEntry.first_name == "望舒")
        ).one()
        entry.is_borrowed_player = True
        entry.utr_profile_id = "880077"
        session.add(entry)
        session.commit()

    yield TestClient(app)

    with Session(engine) as session:
        _cleanup(session)


def _cleanup(session: Session) -> None:
    team_ids = [
        t.id
        for t in session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    ]
    if team_ids:
        session.execute(delete(RosterEntry).where(RosterEntry.team_id.in_(team_ids)))
        session.execute(delete(Team).where(Team.id.in_(team_ids)))
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()


def teams_url(year=TEST_YEAR, code="silver") -> str:
    return f"/api/seasons/{year}/divisions/{code}/teams"


def roster_url(team="API-ALPHA", year=TEST_YEAR, code="silver") -> str:
    return f"{teams_url(year, code)}/{team}/roster"


class TestTeamList:
    def test_lists_the_divisions_teams(self, client):
        response = client.get(teams_url(), headers=AUTH)
        assert response.status_code == 200

        body = response.json()
        assert [t["code"] for t in body] == ["API-ALPHA", "API-BETA"]

    def test_includes_the_roster_size(self, client):
        # A captain scanning the list needs to see which teams look
        # under-strength or suspiciously small before opening each one.
        body = client.get(teams_url(), headers=AUTH).json()
        by_code = {t["code"]: t for t in body}

        assert by_code["API-ALPHA"]["player_count"] == 2
        assert by_code["API-BETA"]["player_count"] == 1

    def test_unknown_season_is_404(self, client):
        assert client.get(teams_url(year=1899), headers=AUTH).status_code == 404

    def test_unknown_division_is_404(self, client):
        assert client.get(teams_url(code="bronze"), headers=AUTH).status_code == 404


class TestRoster:
    def test_returns_every_entry_with_its_source_evidence(self, client):
        response = client.get(roster_url(), headers=AUTH)
        assert response.status_code == 200

        body = response.json()
        assert body["team"]["code"] == "API-ALPHA"
        by_name = {p["first_name"]: p for p in body["players"]}

        assert by_name["望舒"]["match_utr"] == "6.50"
        assert by_name["望舒"]["dutr_status"] == "Rated"
        assert by_name["望舒"]["rating_class"] == "verified"
        assert by_name["门吹雪"]["source_note"] == "Captain Provided UTR"

    def test_undetermined_rating_class_is_null_not_guessed(self, client):
        body = client.get(roster_url(), headers=AUTH).json()
        by_name = {p["first_name"]: p for p in body["players"]}

        # The importer refuses to classify Unrated players; the API must carry
        # that "unknown" through rather than substituting a default.
        assert by_name["门吹雪"]["rating_class"] is None

    def test_borrowed_player_flag_is_three_state(self, client):
        body = client.get(roster_url(), headers=AUTH).json()
        by_name = {p["first_name"]: p for p in body["players"]}

        assert by_name["望舒"]["is_borrowed_player"] is True
        # Not False: nobody has marked this one. Downstream must be able to
        # tell "unmarked" from "confirmed not a borrowed player".
        assert by_name["门吹雪"]["is_borrowed_player"] is None

    def test_profile_id_is_exposed_when_set(self, client):
        body = client.get(roster_url(), headers=AUTH).json()
        by_name = {p["first_name"]: p for p in body["players"]}

        assert by_name["望舒"]["utr_profile_id"] == "880077"
        assert by_name["门吹雪"]["utr_profile_id"] is None

    def test_unknown_team_is_404_not_an_empty_roster(self, client):
        # An empty list would read as "this team has no players", which is a
        # different and false claim.
        assert client.get(roster_url(team="API-GHOST"), headers=AUTH).status_code == 404

    def test_unknown_season_is_404(self, client):
        assert client.get(roster_url(year=1899), headers=AUTH).status_code == 404


class TestAccess:
    def test_team_list_requires_the_shared_secret(self, client):
        assert client.get(teams_url()).status_code == 401

    def test_roster_requires_the_shared_secret(self, client):
        assert client.get(roster_url()).status_code == 401


def _api_surface() -> dict[str, set[str]]:
    """Every path and method the app exposes.

    Read from the OpenAPI schema rather than app.routes: this FastAPI version
    keeps an included router as one opaque entry instead of flattening its
    APIRoutes, so walking that list sees no /api routes at all and a "no write
    routes" assertion built on it would pass while the app served anything.
    """
    schema = app.openapi()
    return {
        path: {method.upper() for method in operations}
        for path, operations in schema["paths"].items()
    }


def test_roster_routes_are_registered():
    # Keeps the assertion below from passing vacuously.
    surface = _api_surface()
    assert "/api/seasons/{year}/divisions/{code}/teams" in surface
    assert "/api/seasons/{year}/divisions/{code}/teams/{team_code}/roster" in surface


def test_no_write_route_exists():
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    offenders = {
        path: sorted(methods & write_methods)
        for path, methods in _api_surface().items()
        if methods & write_methods
    }

    assert offenders == {}
