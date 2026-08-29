"""The read-only lineup search endpoint.

The engine itself is tested against invented rosters in test_lineup_rules /
_search / _report. What is tested here is the route: that it reads the
division's real rule values and the team's real roster, passes locks and
exclusions through from the query, and reports the three states the engine
can be in without flattening any of them into an empty list.

Still no write methods. Lineups are not persisted and this app has no
per-user login, so a write path would let anyone rewrite every team's plan.

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
from app.models import (
    Division,
    DivisionEligibilityLimit,
    DivisionLine,
    RosterEntry,
    Season,
    Team,
)
from app.rosters.load import load_rosters

AUTH = {"X-Backend-Secret": "test-secret"}
TEST_YEAR = 1994  # reserved for this module

HEADER = (
    "Team,Last Name,First Name,Gender,DUTR Status,Match UTR,"
    "Verified DUTR 09/22,Notes"
)
MEN = [("6.80", "m1"), ("6.40", "m2"), ("6.00", "m3"), ("5.80", "m4"),
       ("5.60", "m5"), ("5.40", "m6"), ("5.20", "m7"), ("5.00", "m8")]
WOMEN = [("5.00", "w1"), ("4.80", "w2"), ("4.60", "w3"), ("4.40", "w4")]
ROWS = (
    [f"LINEUP-A,南,{n},M,Rated,{utr},{utr}," for utr, n in MEN]
    + [f"LINEUP-A,西,{n},F,Rated,{utr},{utr}," for utr, n in WOMEN]
    # A second team too small to field five lines: the endpoint has to answer
    # for it without pretending the roster is merely weak.
    + ["LINEUP-B,北,x1,M,Rated,6.00,6.00,"]
)


def _cleanup(session: Session) -> None:
    teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    for team in teams:
        session.execute(delete(RosterEntry).where(RosterEntry.team_id == team.id))
    session.execute(delete(Team).where(Team.season_year == TEST_YEAR))
    divisions = session.exec(
        select(Division).where(Division.season_year == TEST_YEAR)
    ).all()
    for division in divisions:
        session.execute(
            delete(DivisionEligibilityLimit).where(
                DivisionEligibilityLimit.division_id == division.id
            )
        )
        session.execute(
            delete(DivisionLine).where(DivisionLine.division_id == division.id)
        )
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()


@pytest.fixture(scope="module")
def client():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="阵容接口测试赛季"))
        session.commit()
        division = Division(
            season_year=TEST_YEAR,
            code="silver",
            display_name="银组",
            scoring_mode="match_count",
            buffer_per_line=Decimal("0.5"),
            buffer_total=Decimal("0.5"),
            partner_gap_max=Decimal("3.50"),
        )
        session.add(division)
        session.commit()
        session.refresh(division)
        for code, kind, order, cap in [
            ("D1", "mens_doubles", 1, Decimal("13.00")),
            ("D2", "mens_doubles", 2, Decimal("12.00")),
            ("D3", "mens_doubles", 3, Decimal("11.00")),
            ("MD", "mixed_doubles", 4, Decimal("10.25")),
            ("WD", "womens_doubles", 5, Decimal("9.25")),
        ]:
            session.add(
                DivisionLine(
                    division_id=division.id,
                    code=code,
                    kind=kind,
                    sort_order=order,
                    cap=cap,
                    points=1,
                )
            )
        session.add(
            DivisionEligibilityLimit(
                division_id=division.id,
                gender="M",
                utr_above=Decimal("7.0"),
                max_players=1,
            )
        )
        session.commit()
        load_rosters(session, "\n".join([HEADER, *ROWS]) + "\n", TEST_YEAR, "silver")

    yield TestClient(app)

    with Session(engine) as session:
        _cleanup(session)


def search(client: TestClient, team: str = "LINEUP-A", **params):
    return client.get(
        f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/{team}/lineups",
        params=params,
        headers=AUTH,
    )


def keys_by_name(client: TestClient) -> dict[str, str]:
    """The player keys the endpoint itself hands out, so a lock can be
    expressed the way a caller would build it — from a previous response,
    not from a database id guessed here."""
    body = search(client).json()
    found: dict[str, str] = {}
    for candidate in body["candidates"]:
        for pair in candidate["lines"].values():
            for player in pair:
                found[player["first_name"]] = player["key"]
    return found


class TestSearchResponse:
    def test_returns_candidates_ceiling_and_the_three_state_flags(self, client):
        response = search(client)
        assert response.status_code == 200
        body = response.json()

        assert body["candidates"], "a full roster has legal lineups"
        assert Decimal(body["ceiling"]) > 0
        assert body["squads_at_ceiling"] >= 1

        # The three states that must never be inferred from an empty list.
        assert body["infeasible_line"] is None
        assert body["truncated"] is False
        assert body["borrowed_players_checked"] is False

    def test_each_candidate_carries_its_five_lines_and_buffer_spend(self, client):
        body = search(client).json()
        candidate = body["candidates"][0]

        assert set(candidate["lines"]) == {"D1", "D2", "D3", "MD", "WD"}
        for pair in candidate["lines"].values():
            assert len(pair) == 2
            for player in pair:
                # Gender is a required column on the page: the high-UTR limits
                # are set per gender, so a lineup shown without it cannot be
                # checked against that rule by eye.
                assert player["gender"] in {"M", "F", None}
                assert Decimal(player["match_utr"]) > 0
        assert Decimal(candidate["buffer_spent"]) >= 0
        assert Decimal(candidate["total"]) == sum(
            Decimal(p["match_utr"])
            for pair in candidate["lines"].values()
            for p in pair
        )


class TestLocksAndExclusionsFromTheQuery:
    def test_a_locked_pair_stands_on_that_line_in_every_candidate(self, client):
        keys = keys_by_name(client)
        response = search(client, lock=[f"WD:{keys['w3']},{keys['w4']}"])
        assert response.status_code == 200
        body = response.json()

        assert body["candidates"]
        for candidate in body["candidates"]:
            assert {p["key"] for p in candidate["lines"]["WD"]} == {
                keys["w3"],
                keys["w4"],
            }

    def test_an_excluded_player_stands_nowhere(self, client):
        keys = keys_by_name(client)
        body = search(client, exclude=[keys["m1"]]).json()

        assert body["candidates"]
        for candidate in body["candidates"]:
            on_court = {
                p["key"] for pair in candidate["lines"].values() for p in pair
            }
            assert keys["m1"] not in on_court

    def test_a_lock_the_rules_forbid_is_reported_not_silently_dropped(self, client):
        keys = keys_by_name(client)
        # Two of the strongest men on the weakest men's line: over its cap by
        # more than any buffer allows.
        body = search(client, lock=[f"D3:{keys['m1']},{keys['m2']}"]).json()

        assert body["invalid_locks"], "the lock breaks a cap and must be named"
        assert body["invalid_locks"][0]["line"] == "D3"
        assert not body["candidates"]

    @pytest.mark.parametrize(
        "bad",
        [
            "D1",  # no players
            "D1:only-one",  # one key where two are needed
            "D1:1,2,3",  # three keys
            ":1,2",  # no line
        ],
    )
    def test_a_malformed_lock_is_a_client_error_not_a_crash(self, client, bad):
        response = search(client, lock=[bad])
        assert 400 <= response.status_code < 500

    def test_a_lock_naming_a_line_or_player_this_team_lacks_is_a_client_error(
        self, client
    ):
        keys = keys_by_name(client)
        assert 400 <= search(
            client, lock=[f"D9:{keys['m1']},{keys['m2']}"]
        ).status_code < 500
        assert 400 <= search(client, lock=["D1:999999,999998"]).status_code < 500
        assert 400 <= search(client, exclude=["999999"]).status_code < 500


class TestUnknownTargetsAndTheAbsenceOfWrites:
    def test_an_unknown_team_is_404(self, client):
        assert search(client, team="NO-SUCH-TEAM").status_code == 404

    def test_an_unknown_division_is_404(self, client):
        response = client.get(
            f"/api/seasons/{TEST_YEAR}/divisions/bronze/teams/LINEUP-A/lineups",
            headers=AUTH,
        )
        assert response.status_code == 404

    def test_a_team_too_small_reports_the_line_rather_than_404(self, client):
        # A real team that cannot field five lines is not a missing team, and
        # its answer is a named infeasible line — not a 404 and not an empty
        # candidate list either.
        body = search(client, team="LINEUP-B").json()
        assert body["infeasible_line"] is not None
        assert not body["candidates"]

    def test_the_lineup_surface_exposes_no_write_method(self):
        # Read app.openapi(), never app.routes: this FastAPI version stores an
        # include_router() call as one opaque entry and does not flatten the
        # child routes, so walking app.routes sees no /api path at all and the
        # assertion passes while checking nothing.
        #
        # Scoped to the lineup paths. The app-wide version of this assertion
        # was true until player management added write routes; the app-wide
        # invariant now lives in test_admin_auth.py as "every write route
        # refuses a request without the admin credential". Lineups themselves
        # are still recomputed on demand and never stored, so there is nothing
        # here for a write method to write.
        paths = app.openapi()["paths"]
        lineup_paths = [path for path in paths if path.endswith("/lineups")]
        assert lineup_paths, (
            "the guard is only meaningful if the lineup route is registered"
        )
        for path in lineup_paths:
            for method in paths[path]:
                assert method.lower() in {"get", "head", "options"}, (
                    f"{method.upper()} {path} is a write method"
                )
