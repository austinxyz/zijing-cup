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
import re

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
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    Team,
)

AUTH = {"X-Backend-Secret": "test-secret"}
TEST_YEAR = 1994  # reserved for this module

MEN = [("6.80", "m1"), ("6.40", "m2"), ("6.00", "m3"), ("5.80", "m4"),
       ("5.60", "m5"), ("5.40", "m6"), ("5.20", "m7"), ("5.00", "m8")]
WOMEN = [("5.00", "w1"), ("4.80", "w2"), ("4.60", "w3"), ("4.40", "w4")]

#: (team, last, first, gender, this season's participation UTR)
ROWS = (
    [("LINEUP-A", "南", n, "M", utr) for utr, n in MEN]
    + [("LINEUP-A", "西", n, "F", utr) for utr, n in WOMEN]
    # A second team too small to field five lines: the endpoint has to answer
    # for it without pretending the roster is merely weak.
    + [("LINEUP-B", "北", "x1", "M", "6.00")]
)

#: (last, first, gender, season offset from TEST_YEAR or None, utr, unresolved)
EXTRA = [
    # Nothing anywhere: on the team, but there is no number to place him with.
    ("钱", "nought", "M", None, None, False),
    # Only last season's value: he plays on a derived number.
    ("孙", "derived", "M", -1, "5.10", False),
    # This season, but with two candidates and no ruling.
    ("李", "disputed", "M", 0, "5.30", True),
]


def _build_registry(session: Session, teams: dict[str, Team]) -> None:
    for code, last, first, gender, utr in ROWS:
        player = Player(last_name=last, first_name=first, gender=gender)
        session.add(player)
        session.commit()
        session.refresh(player)
        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=teams[code].id)
        )
        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=Decimal(utr),
                status="verified",
                source="committee_sheet",
            )
        )
    session.commit()


def _build_extra(session: Session, team: Team) -> None:
    for last, first, gender, offset, utr, unresolved in EXTRA:
        player = Player(last_name=last, first_name=first, gender=gender)
        session.add(player)
        session.commit()
        session.refresh(player)
        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=team.id)
        )
        if offset is not None:
            session.add(
                PlayerSeasonUtr(
                    player_id=player.id,
                    season_year=TEST_YEAR + offset,
                    value=Decimal(utr),
                    is_unresolved=unresolved,
                    alt_value=Decimal("5.00") if unresolved else None,
                    status="verified",
                    source="committee_sheet",
                )
            )
    session.commit()


def _cleanup(session: Session) -> None:
    teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    team_ids = [team.id for team in teams]
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
        session.execute(delete(Team).where(Team.id.in_(team_ids)))
        if player_ids:
            session.execute(delete(Player).where(Player.id.in_(player_ids)))
    divisions = session.exec(
        select(Division).where(Division.season_year == TEST_YEAR)
    ).all()
    for division in divisions:
        session.execute(
            delete(DivisionLine).where(DivisionLine.division_id == division.id)
        )
        session.execute(
            delete(DivisionEligibilityLimit).where(
                DivisionEligibilityLimit.division_id == division.id
            )
        )
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
        teams: dict[str, Team] = {}
        for code, *_ in ROWS:
            if code in teams:
                continue
            team = Team(season_year=TEST_YEAR, division_code="silver", code=code)
            session.add(team)
            session.commit()
            session.refresh(team)
            teams[code] = team
        _build_registry(session, teams)
        session.add(Season(year=TEST_YEAR - 1, edition_name="阵容接口上届"))
        session.commit()
        _build_extra(session, teams["LINEUP-A"])

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


class TestPlayerKeys:
    def test_keys_are_prefixed_so_the_old_bare_integers_cannot_parse(self, client):
        # The old keys were roster_entries ids: bare integers, the same shape
        # as players ids. A stale shared link would have parsed cleanly and
        # locked two unrelated people into a lineup that looked legal.
        body = search(client).json()

        assert body["roster"], "the response carries the roster it searched"
        for player in body["roster"]:
            assert re.fullmatch(r"p\d+", player["key"]), player["key"]


class TestWhoIsAndIsNotInTheSearch:
    def test_a_player_with_no_derivable_value_is_counted_not_dropped(self, client):
        # The ceiling and every candidate are computed over the rest, so
        # saying nothing would present a partial answer as the whole squad's.
        body = search(client).json()

        assert body["missing_utr_count"] == 1
        assert all(p["first_name"] != "nought" for p in body["roster"])

    def test_players_on_a_derived_number_are_counted(self, client):
        body = search(client).json()

        assert body["estimated_count"] == 1

    def test_players_on_an_unruled_value_are_counted(self, client):
        body = search(client).json()

        assert body["unresolved_count"] == 1

    def test_a_squad_with_nothing_missing_reports_zero(self, client):
        body = search(client, team="LINEUP-B").json()

        assert body["missing_utr_count"] == 0
        assert body["estimated_count"] == 0
        assert body["unresolved_count"] == 0


class TestOneNumberPerPlayer:
    def test_the_roster_page_and_the_engine_agree(self, client):
        # Two readers, one chain. If they ever disagree, a captain checks a
        # lineup against a roster that says something else and neither screen
        # admits which is wrong.
        lineup = search(client).json()
        roster = client.get(
            f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/LINEUP-A/roster",
            headers=AUTH,
        ).json()

        by_name = {p["first_name"]: p["match_utr"] for p in roster["players"]}
        assert by_name, "the roster endpoint returned players"

        for player in lineup["roster"]:
            assert player["match_utr"] == by_name[player["first_name"]], (
                player["first_name"]
            )

    def test_the_derived_player_is_derived_on_both(self, client):
        roster = client.get(
            f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/LINEUP-A/roster",
            headers=AUTH,
        ).json()
        by_name = {p["first_name"]: p for p in roster["players"]}

        assert by_name["derived"]["origin"] == "prior_season"
        assert by_name["derived"]["origin_year"] == TEST_YEAR - 1
        # And the engine used the same number for him.
        lineup = search(client).json()
        engine = {p["first_name"]: p["match_utr"] for p in lineup["roster"]}
        assert engine["derived"] == by_name["derived"]["match_utr"]


class TestPerPlayerProvenance:
    def test_each_number_says_where_it_came_from(self, client):
        # A candidate is checked line by line by eye. A derived number sits
        # exactly where its size puts it, so without a mark on the number
        # itself there is nothing to distinguish it from a frozen one.
        body = search(client).json()
        by_name = {p["first_name"]: p for p in body["roster"]}

        assert by_name["m1"]["origin"] == "frozen"
        assert by_name["derived"]["origin"] == "prior_season"
        assert by_name["derived"]["origin_year"] == TEST_YEAR - 1
        assert by_name["disputed"]["is_unresolved"] is True

    def test_players_inside_a_candidate_carry_it_too(self, client):
        # The roster list is not enough: the card shows the ten on court, and
        # that is where the reader is looking.
        body = search(client).json()

        derived = 0
        for candidate in body["candidates"]:
            for pair in candidate["lines"].values():
                for player in pair:
                    # Not merely present: a null here would count as "not
                    # frozen" downstream and mark every player as estimated.
                    assert player["origin"] in {
                        "frozen",
                        "current_doubles",
                        "prior_season",
                    }, player
                    if player["first_name"] == "derived":
                        derived += 1
                        assert player["origin"] == "prior_season"
        assert derived > 0, "the derived player stands in at least one candidate"


class TestStaleLinks:
    def test_a_bare_integer_lock_is_reported_as_an_old_link(self, client):
        # Not a generic 4xx: the reader has to know the link is stale rather
        # than that they mistyped something.
        response = search(client, lock=["WD:12,13"])

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "旧格式" in detail or "old link" in detail.lower()

    def test_a_bare_integer_exclusion_is_reported_the_same_way(self, client):
        response = search(client, exclude=["12"])

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "旧格式" in detail or "old link" in detail.lower()

    def test_a_stale_link_does_not_return_a_lineup(self, client):
        # The dangerous outcome is a full candidate list computed as though
        # the lock had been honoured.
        body = search(client, lock=["WD:12,13"]).json()

        assert "candidates" not in body


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

    def test_an_infeasible_line_carries_structured_reasons(self, client):
        # LINEUP-B is one man: whichever line runs dry says why, not just which.
        body = search(client, team="LINEUP-B").json()
        assert body["infeasibility"] is not None
        assert body["infeasibility"]["line"] == body["infeasible_line"]
        reasons = body["infeasibility"]["reasons"]
        assert reasons, "an infeasible line must carry at least one reason"
        assert any(r["kind"] == "gender_shortage" for r in reasons)
        for r in reasons:
            assert "kind" in r and "message" in r and "attributed" in r

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
