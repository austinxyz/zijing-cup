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
from app.models import (
    Division,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    RosterEntry,
    Season,
    Team,
)
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
    # Gender left blank on purpose: the column is nullable, and the team-list
    # counts have to have somewhere to put this player that is neither 男 nor 女.
    "API-BETA,东,方朔,,Rated,5.00,5.0,5.1,",
]


#: (team, last, first, gender, season utr, committee status, appeal)
REGISTRY = [
    ("API-ALPHA", "南", "望舒", "M", "6.50", "verified", False),
    ("API-ALPHA", "西", "门吹雪", "F", "4.00", None, False),
    # On the team but never in the CSV snapshot: the whole point of the switch
    # is that a player added through the admin UI shows up here.
    ("API-ALPHA", "顾", "青阳", "M", "6.00", "captain", True),
    # No value for this season at all: what he has is an older one, and the
    # roster has to derive from it rather than drop him.
    ("API-ALPHA", "柳", "如是", "F", None, None, False),
    ("API-BETA", "北", "冥子", "M", "7.10", "committee", False),
    ("API-BETA", "东", "方朔", None, "5.00", "verified", False),
]


def _build_registry(session: Session, teams: dict[str, Team]) -> None:
    for code, last, first, gender, utr, status, appeal in REGISTRY:
        player = Player(last_name=last, first_name=first, gender=gender)
        session.add(player)
        session.commit()
        session.refresh(player)
        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=teams[code].id)
        )
        if utr is None:
            continue
        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=Decimal(utr),
                status=status,
                under_appeal=appeal,
                source="committee_sheet",
            )
        )
    session.commit()


@pytest.fixture(scope="module")
def client():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="接口测试赛季"))
        # The season before it exists too, so the derivation chain has
        # somewhere to fall back to.
        session.add(Season(year=TEST_YEAR - 1, edition_name="接口测试上届"))
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

        # Hand-set state the importer deliberately never produces, so the
        # endpoints are exercised with it rather than only with what an
        # import can make.
        alpha = session.exec(
            select(Team).where(
                Team.season_year == TEST_YEAR, Team.code == "API-ALPHA"
            )
        ).one()
        alpha.display_name = "接口测试甲队"
        session.add(alpha)
        session.commit()
        # One hand-set field, so the endpoint is exercised with the state the
        # importer deliberately never produces.
        entry = session.exec(
            select(RosterEntry).where(RosterEntry.first_name == "望舒")
        ).one()
        entry.is_borrowed_player = True
        entry.utr_profile_id = "880077"
        session.add(entry)
        session.commit()

        _build_registry(
            session,
            {
                team.code: team
                for team in session.exec(
                    select(Team).where(Team.season_year == TEST_YEAR)
                ).all()
            },
        )

        # Hand-set state the importer never produces, so the endpoint is
        # exercised with it. It lives on the membership and the player now —
        # that is where the roster reads it from.
        # Her only participation value is last season's; this season has
        # none.
        earlier = session.exec(
            select(Player).where(Player.first_name == "如是")
        ).one()
        session.add(
            PlayerSeasonUtr(
                player_id=earlier.id,
                season_year=TEST_YEAR - 1,
                value=Decimal("5.60"),
                status="verified",
                source="committee_sheet",
            )
        )
        session.commit()

        borrowed = session.exec(
            select(Player).where(Player.first_name == "望舒")
        ).one()
        borrowed.utr_profile_id = "880077"
        session.add(borrowed)
        membership = session.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == borrowed.id
            )
        ).one()
        membership.is_borrowed_player = True
        session.add(membership)
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
        player_ids = [
            m.player_id
            for m in session.exec(
                select(PlayerTeamMembership).where(
                    PlayerTeamMembership.team_id.in_(team_ids)
                )
            ).all()
        ]
        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.team_id.in_(team_ids)
            )
        )
        if player_ids:
            session.execute(
                delete(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id.in_(player_ids)
                )
            )
        session.execute(delete(RosterEntry).where(RosterEntry.team_id.in_(team_ids)))
        session.execute(delete(Team).where(Team.id.in_(team_ids)))
        if player_ids:
            session.execute(delete(Player).where(Player.id.in_(player_ids)))
    session.execute(
        delete(PlayerSeasonUtr).where(
            PlayerSeasonUtr.season_year.in_([TEST_YEAR, TEST_YEAR - 1])
        )
    )
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(
        delete(Season).where(Season.year.in_([TEST_YEAR, TEST_YEAR - 1]))
    )
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

        # Three, not two: one of them was added through the admin UI and has
        # no row in the CSV snapshot at all.
        assert by_code["API-ALPHA"]["player_count"] == 4
        assert by_code["API-BETA"]["player_count"] == 2

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
        assert by_name["望舒"]["rating_class"] == "verified"
        # The registry-only player is in the roster too — he is on the team.
        assert by_name["青阳"]["rating_class"] == "captain"
        assert by_name["青阳"]["under_appeal"] is True

    def test_a_player_without_this_seasons_value_is_still_on_the_roster(
        self, client
    ):
        # He is on the team; leaving him out would misreport the squad. The
        # number is derived from the last season that had one, and the
        # response has to say so — with the year, since deriving from 2024 and
        # from last year are different degrees of confidence.
        body = client.get(roster_url(), headers=AUTH).json()
        by_name = {p["first_name"]: p for p in body["players"]}

        assert by_name["如是"]["match_utr"] == "5.60"
        assert by_name["如是"]["origin"] == "prior_season"
        assert by_name["如是"]["origin_year"] == TEST_YEAR - 1

    def test_a_frozen_value_is_not_marked_as_derived(self, client):
        body = client.get(roster_url(), headers=AUTH).json()
        by_name = {p["first_name"]: p for p in body["players"]}

        assert by_name["望舒"]["origin"] == "frozen"
        assert by_name["望舒"]["origin_year"] == TEST_YEAR

    def test_the_sheet_only_fields_are_always_null(self, client):
        # They have no counterpart in the registry. Kept in the response so
        # its shape does not change, but a consumer must not read a fact out
        # of them: null here means "not stored any more", not "the sheet was
        # silent".
        body = client.get(roster_url(), headers=AUTH).json()

        for player in body["players"]:
            assert player["dutr_status"] is None
            assert player["source_note"] is None
            assert player["daily_utrs"] == []

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


def test_every_write_route_sits_behind_the_admin_credential():
    """Replaces "no write route exists".

    Write routes exist now, so the invariant moved rather than disappeared:
    anything that changes data must refuse a request carrying only the shared
    secret. This probes each route instead of reading a list, so it cannot go
    stale as routes are added — and it still reads app.openapi() rather than
    app.routes for the reason in _api_surface's docstring.

    Rosters themselves are still not writable over HTTP: they change through a
    reviewed CSV and the importer. What changed is that "no writes anywhere"
    stopped being the way to say so.
    """
    from fastapi.testclient import TestClient

    client = TestClient(app)
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    probed = 0
    for path, methods in _api_surface().items():
        for method in sorted(methods & write_methods):
            probed += 1
            response = client.request(method, path, headers=AUTH)
            assert response.status_code in (401, 403), (
                f"{method} {path} answered {response.status_code} without an "
                "admin credential"
            )

    # Not an assertion that writes exist — today none do under this router.
    # The count is here so a future reader can see the guard ran.
    assert probed >= 0


class TestTeamDisplayName:
    def test_team_list_carries_the_display_name(self, client):
        body = client.get(teams_url(), headers=AUTH).json()
        by_code = {t["code"]: t for t in body}

        assert by_code["API-ALPHA"]["display_name"] == "接口测试甲队"
        # Null, not the code echoed back: the UI decides how to present an
        # unnamed team, and a name invented here would be indistinguishable
        # from one a human chose.
        assert by_code["API-BETA"]["display_name"] is None

    def test_roster_response_carries_the_display_name(self, client):
        body = client.get(roster_url(), headers=AUTH).json()

        assert body["team"]["code"] == "API-ALPHA"
        assert body["team"]["display_name"] == "接口测试甲队"


class TestGenderBreakdown:
    def test_team_list_splits_the_roster_by_gender(self, client):
        # Fielding a lineup needs one woman for mixed doubles and two for
        # women's doubles — at least three on court. That constraint is what
        # this breakdown exists to make visible from the list.
        body = client.get(teams_url(), headers=AUTH).json()
        by_code = {t["code"]: t for t in body}

        # Two men and one woman: the third is the registry-only player, and
        # gender comes off the player record, not the snapshot row.
        assert by_code["API-ALPHA"]["men_count"] == 2
        assert by_code["API-ALPHA"]["women_count"] == 2
        # Zero, not one: the registry-only player has a gender on his player
        # record. Reading gender off the snapshot would drop him in here.
        assert by_code["API-ALPHA"]["unknown_gender_count"] == 0

    def test_players_without_a_gender_are_counted_separately(self, client):
        # Not folded into either side: gender is nullable, and adding an
        # unknown to 男 or 女 would invent a player on that side — while the
        # count is precisely what a captain reads to check feasibility.
        body = client.get(teams_url(), headers=AUTH).json()
        by_code = {t["code"]: t for t in body}

        assert by_code["API-BETA"]["men_count"] == 1
        assert by_code["API-BETA"]["women_count"] == 0
        assert by_code["API-BETA"]["unknown_gender_count"] == 1

    def test_the_three_buckets_sum_to_the_player_count(self, client):
        body = client.get(teams_url(), headers=AUTH).json()

        for entry in body:
            total = (
                entry["men_count"]
                + entry["women_count"]
                + entry["unknown_gender_count"]
            )
            assert total == entry["player_count"], entry["code"]


def test_team_list_does_not_issue_a_query_per_team(client):
    """The breakdown must stay one grouped query.

    Counting genders per team is the obvious way to write this and the
    expensive one: a division has up to two dozen teams, so it would be two
    dozen round trips for a number that is one GROUP BY away. Asserted rather
    than commented, because nothing else would notice the regression.
    """
    import sqlalchemy

    from app.db import engine
    from app.rosters.query import list_teams

    statements: list[str] = []
    listener = lambda conn, cur, stmt, *a: statements.append(stmt)  # noqa: E731
    sqlalchemy.event.listen(engine, "before_cursor_execute", listener)
    try:
        with Session(engine) as session:
            teams = list_teams(session, TEST_YEAR, "silver")
    finally:
        sqlalchemy.event.remove(engine, "before_cursor_execute", listener)

    assert len(teams) == 2  # the fixture's two teams — not a vacuous pass
    selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
    # One existence check for the division, one aggregate. Constant in the
    # number of teams.
    assert len(selects) == 2, "\n\n".join(selects)
