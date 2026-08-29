"""The player endpoints: the project's first write surface.

Reads are open to anyone holding the shared secret, exactly as before. Writes
additionally require the admin credential — that check lives in middleware and
is exercised in test_admin_auth.py, so what is tested here is the behaviour
behind it.

A player exists independently of any team. That is the whole reason this
capability exists: a captain who finds someone on the UTR site should be able
to record them without waiting for a new committee sheet.

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
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    SeasonLock,
    Team,
)

READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}
TEST_YEAR = 1990  # reserved for this module


def _purge(session: Session) -> None:
    teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    for team in teams:
        session.execute(
            delete(PlayerTeamMembership).where(PlayerTeamMembership.team_id == team.id)
        )
    session.execute(
        delete(PlayerSeasonUtr).where(PlayerSeasonUtr.season_year == TEST_YEAR)
    )
    session.commit()
    for team in teams:
        session.delete(team)
    session.commit()
    session.execute(delete(SeasonLock).where(SeasonLock.season_year == TEST_YEAR))
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()
    for player in session.exec(
        select(Player).where(Player.last_name.in_(["测", "试", "验"]))
    ).all():
        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        )
        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        )
        session.delete(player)
    session.commit()


@pytest.fixture()
def client():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="端点测试赛季"))
        session.commit()
        for code, name in [("gold", "金组"), ("silver", "银组")]:
            session.add(
                Division(
                    season_year=TEST_YEAR,
                    code=code,
                    display_name=name,
                    scoring_mode="match_count",
                    partner_gap_max=Decimal("3.50"),
                )
            )
        session.commit()
        for code, division in [("API-GOLD", "gold"), ("API-SILVER", "silver")]:
            session.add(
                Team(season_year=TEST_YEAR, division_code=division, code=code)
            )
        session.commit()

    yield TestClient(app)

    with Session(engine) as session:
        _purge(session)


def team_id(code: str) -> int:
    with Session(engine) as session:
        return session.exec(
            select(Team).where(Team.season_year == TEST_YEAR, Team.code == code)
        ).one().id


def make_player(client: TestClient, **overrides) -> dict:
    payload = {"last_name": "测", "first_name": "试一", "gender": "M"}
    payload.update(overrides)
    response = client.post("/api/players", json=payload, headers=WRITE)
    assert response.status_code == 201, response.text
    return response.json()


class TestPlayerCrud:
    def test_a_player_can_be_created_with_only_a_name(self, client):
        player = make_player(client, last_name="测", first_name="试二", gender=None)

        assert player["id"]
        # No team, no season UTR — a complete record, not a half-filled one.
        assert player["memberships"] == []
        assert player["season_utrs"] == []

    def test_a_created_player_can_be_read_back(self, client):
        player = make_player(
            client,
            singles_utr="7.23",
            singles_status="projected",
            doubles_utr="6.72",
            doubles_status="rated",
            utr_profile_id="4713142",
        )

        body = client.get(f"/api/players/{player['id']}", headers=READ).json()

        assert body["last_name"] == "测"
        assert body["singles_utr"] == "7.23"
        assert body["singles_status"] == "projected"
        assert body["doubles_status"] == "rated"
        assert body["utr_profile_id"] == "4713142"

    def test_a_player_can_be_edited(self, client):
        player = make_player(client)

        response = client.patch(
            f"/api/players/{player['id']}",
            json={"doubles_utr": "6.10", "doubles_status": "rated"},
            headers=WRITE,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["doubles_utr"] == "6.10"
        # Untouched fields stay as they were rather than being reset to null.
        assert body["last_name"] == "测"

    def test_a_player_with_nothing_attached_can_be_deleted(self, client):
        player = make_player(client)

        assert client.delete(
            f"/api/players/{player['id']}", headers=WRITE
        ).status_code == 204
        assert client.get(
            f"/api/players/{player['id']}", headers=READ
        ).status_code == 404

    def test_the_list_can_be_searched_by_name(self, client):
        make_player(client, last_name="测", first_name="甲")
        make_player(client, last_name="试", first_name="乙")

        body = client.get("/api/players?q=乙", headers=READ).json()

        assert [p["first_name"] for p in body] == ["乙"]


class TestMemberships:
    def test_a_player_can_join_a_team(self, client):
        player = make_player(client)

        response = client.post(
            f"/api/players/{player['id']}/memberships",
            json={
                "team_id": team_id("API-SILVER"),
                "representing_school": "浙大",
                "is_borrowed_player": True,
                "is_wildcard": False,
            },
            headers=WRITE,
        )

        assert response.status_code == 201
        body = client.get(f"/api/players/{player['id']}", headers=READ).json()
        membership = body["memberships"][0]
        assert membership["team_code"] == "API-SILVER"
        assert membership["representing_school"] == "浙大"
        assert membership["is_borrowed_player"] is True
        assert membership["is_wildcard"] is False

    def test_one_player_can_be_on_both_divisions_teams(self, client):
        player = make_player(client)

        for code in ("API-GOLD", "API-SILVER"):
            assert client.post(
                f"/api/players/{player['id']}/memberships",
                json={"team_id": team_id(code)},
                headers=WRITE,
            ).status_code == 201

        body = client.get(f"/api/players/{player['id']}", headers=READ).json()
        assert {m["team_code"] for m in body["memberships"]} == {
            "API-GOLD",
            "API-SILVER",
        }

    def test_leaving_a_team_keeps_the_player_and_their_season_utrs(self, client):
        player = make_player(client)
        client.post(
            f"/api/players/{player['id']}/memberships",
            json={"team_id": team_id("API-SILVER")},
            headers=WRITE,
        )
        client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={"value": "6.00", "status": "verified", "source": "committee_sheet"},
            headers=WRITE,
        )
        membership_id = client.get(
            f"/api/players/{player['id']}", headers=READ
        ).json()["memberships"][0]["id"]

        assert client.delete(
            f"/api/players/{player['id']}/memberships/{membership_id}",
            headers=WRITE,
        ).status_code == 204

        body = client.get(f"/api/players/{player['id']}", headers=READ).json()
        assert body["memberships"] == []
        # The person and their frozen numbers survive leaving a team.
        assert body["season_utrs"][0]["value"] == "6.00"

    def test_joining_the_same_team_twice_is_refused(self, client):
        player = make_player(client)
        body = {"team_id": team_id("API-SILVER")}
        client.post(
            f"/api/players/{player['id']}/memberships", json=body, headers=WRITE
        )

        response = client.post(
            f"/api/players/{player['id']}/memberships", json=body, headers=WRITE
        )

        assert 400 <= response.status_code < 500


class TestSeasonUtrs:
    def test_a_season_utr_can_be_prefilled_then_overwritten(self, client):
        player = make_player(client, doubles_utr="6.40", doubles_status="rated")

        prefill = client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={"value": "6.40", "source": "prefilled"},
            headers=WRITE,
        )
        assert prefill.status_code == 200
        assert prefill.json()["source"] == "prefilled"

        official = client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={
                "value": "6.38",
                "status": "verified",
                "source": "committee_sheet",
            },
            headers=WRITE,
        )

        assert official.status_code == 200
        body = official.json()
        assert body["value"] == "6.38"
        # A guess replaced by an official number has to stop looking like a
        # guess, or the cap arithmetic treats one as the other.
        assert body["source"] == "committee_sheet"

    def test_two_seasons_do_not_interfere(self, client):
        player = make_player(client)
        with Session(engine) as session:
            session.add(Season(year=TEST_YEAR + 1, edition_name="第二个测试赛季"))
            session.commit()

        client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={"value": "6.00", "source": "committee_sheet"},
            headers=WRITE,
        )
        client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR + 1}",
            json={"value": "6.50", "source": "committee_sheet"},
            headers=WRITE,
        )

        body = client.get(f"/api/players/{player['id']}", headers=READ).json()
        by_year = {u["season_year"]: u["value"] for u in body["season_utrs"]}
        assert by_year == {TEST_YEAR: "6.00", TEST_YEAR + 1: "6.50"}

        with Session(engine) as session:
            session.execute(
                delete(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.season_year == TEST_YEAR + 1
                )
            )
            session.execute(delete(Season).where(Season.year == TEST_YEAR + 1))
            session.commit()

    def test_an_undecided_status_is_allowed(self, client):
        player = make_player(client)

        response = client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={"value": "4.25", "source": "prefilled"},
            headers=WRITE,
        )

        # Unrated on the sheet means nobody has classified this player yet.
        assert response.status_code == 200
        assert response.json()["status"] is None


class TestUnknownAndMalformed:
    def test_an_unknown_player_is_404(self, client):
        assert client.get("/api/players/99999999", headers=READ).status_code == 404
        assert client.patch(
            "/api/players/99999999", json={"gender": "F"}, headers=WRITE
        ).status_code == 404
        assert client.delete(
            "/api/players/99999999", headers=WRITE
        ).status_code == 404

    def test_joining_an_unknown_team_is_404(self, client):
        player = make_player(client)

        response = client.post(
            f"/api/players/{player['id']}/memberships",
            json={"team_id": 99999999},
            headers=WRITE,
        )

        assert response.status_code == 404

    def test_a_malformed_payload_is_a_client_error_not_a_crash(self, client):
        assert 400 <= client.post(
            "/api/players", json={"first_name": "只有名"}, headers=WRITE
        ).status_code < 500

        player = make_player(client)
        assert 400 <= client.patch(
            f"/api/players/{player['id']}",
            json={"singles_status": "not-a-status"},
            headers=WRITE,
        ).status_code < 500
        assert 400 <= client.put(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
            json={"value": "6.00", "source": "guessed"},
            headers=WRITE,
        ).status_code < 500

    def test_a_season_utr_for_a_season_that_never_happened_is_refused(self, client):
        player = make_player(client)

        response = client.put(
            f"/api/players/{player['id']}/season-utrs/1899",
            json={"value": "6.00", "source": "committee_sheet"},
            headers=WRITE,
        )

        assert 400 <= response.status_code < 500


class TestMergeSplitAndRulingOverHttp:
    def _player(self, client, first: str) -> dict:
        return make_player(client, last_name="测", first_name=first)

    def _season_utr(self, client, player_id: int, value: str) -> None:
        assert client.put(
            f"/api/players/{player_id}/season-utrs/{TEST_YEAR}",
            json={"value": value, "status": "verified", "source": "committee_sheet"},
            headers=WRITE,
        ).status_code == 200

    def test_merging_reports_what_it_did(self, client):
        keep = self._player(client, "留下")
        drop = self._player(client, "并入")
        client.post(
            f"/api/players/{keep['id']}/memberships",
            json={"team_id": team_id("API-GOLD")},
            headers=WRITE,
        )
        client.post(
            f"/api/players/{drop['id']}/memberships",
            json={"team_id": team_id("API-SILVER")},
            headers=WRITE,
        )
        self._season_utr(client, keep["id"], "6.25")
        self._season_utr(client, drop["id"], "6.38")

        response = client.post(
            f"/api/players/{keep['id']}/merge",
            json={"merge_id": drop["id"]},
            headers=WRITE,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["memberships_moved"] == 1
        # The merge succeeded AND left work behind; saying nothing here would
        # read as "all done".
        assert body["unresolved_seasons"] == [TEST_YEAR]

        merged = client.get(f"/api/players/{keep['id']}", headers=READ).json()
        assert len(merged["memberships"]) == 2
        assert merged["season_utrs"][0]["is_unresolved"] is True
        assert merged["season_utrs"][0]["value"] == "6.38"
        assert client.get(
            f"/api/players/{drop['id']}", headers=READ
        ).status_code == 404

    def test_merging_a_player_into_themselves_is_a_client_error(self, client):
        player = self._player(client, "自己")

        response = client.post(
            f"/api/players/{player['id']}/merge",
            json={"merge_id": player["id"]},
            headers=WRITE,
        )

        assert 400 <= response.status_code < 500

    def test_splitting_moves_only_the_rows_named(self, client):
        player = self._player(client, "一分为二")
        for code in ("API-GOLD", "API-SILVER"):
            client.post(
                f"/api/players/{player['id']}/memberships",
                json={"team_id": team_id(code)},
                headers=WRITE,
            )
        body = client.get(f"/api/players/{player['id']}", headers=READ).json()
        moving = next(
            m for m in body["memberships"] if m["team_code"] == "API-GOLD"
        )

        response = client.post(
            f"/api/players/{player['id']}/split",
            json={
                "last_name": "试",
                "first_name": "新人",
                "membership_ids": [moving["id"]],
                "season_years": [],
            },
            headers=WRITE,
        )

        assert response.status_code == 201
        new_player = response.json()
        assert [m["team_code"] for m in new_player["memberships"]] == ["API-GOLD"]

        original = client.get(f"/api/players/{player['id']}", headers=READ).json()
        assert [m["team_code"] for m in original["memberships"]] == ["API-SILVER"]

    def test_splitting_a_row_that_is_not_theirs_is_404(self, client):
        player = self._player(client, "甲方")
        other = self._player(client, "乙方")
        client.post(
            f"/api/players/{other['id']}/memberships",
            json={"team_id": team_id("API-GOLD")},
            headers=WRITE,
        )
        foreign = client.get(f"/api/players/{other['id']}", headers=READ).json()[
            "memberships"
        ][0]

        response = client.post(
            f"/api/players/{player['id']}/split",
            json={
                "last_name": "试",
                "first_name": "新人",
                "membership_ids": [foreign["id"]],
                "season_years": [],
            },
            headers=WRITE,
        )

        assert response.status_code == 404

    def test_ruling_settles_a_contested_season(self, client):
        keep = self._player(client, "甲")
        drop = self._player(client, "乙")
        self._season_utr(client, keep["id"], "6.25")
        self._season_utr(client, drop["id"], "6.38")
        client.post(
            f"/api/players/{keep['id']}/merge",
            json={"merge_id": drop["id"]},
            headers=WRITE,
        )

        response = client.post(
            f"/api/players/{keep['id']}/season-utrs/{TEST_YEAR}/ruling",
            json={"value": "6.30"},
            headers=WRITE,
        )

        assert response.status_code == 200
        body = response.json()
        # Neither candidate: the committee can correct both sheets afterwards.
        assert body["value"] == "6.30"
        assert body["is_unresolved"] is False
        assert body["source"] == "admin_ruling"

    def test_ruling_on_an_uncontested_season_is_refused(self, client):
        player = self._player(client, "无争议")
        self._season_utr(client, player["id"], "6.00")

        response = client.post(
            f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}/ruling",
            json={"value": "6.10"},
            headers=WRITE,
        )

        assert 400 <= response.status_code < 500


class TestUnresolvedFilterAndTruncation:
    def test_only_the_contested_players_come_back(self, client):
        keep = make_player(client, last_name="测", first_name="有争议")
        drop = make_player(client, last_name="测", first_name="被并入")
        make_player(client, last_name="测", first_name="无争议")
        for player, value in ((keep, "6.25"), (drop, "6.38")):
            client.put(
                f"/api/players/{player['id']}/season-utrs/{TEST_YEAR}",
                json={"value": value, "status": "verified", "source": "committee_sheet"},
                headers=WRITE,
            )
        client.post(
            f"/api/players/{keep['id']}/merge",
            json={"merge_id": drop["id"]},
            headers=WRITE,
        )

        body = client.get("/api/players?unresolved=true", headers=READ).json()
        names = {p["first_name"] for p in body}

        # Scoped to this module's own players: the local database may also hold
        # migrated rows, and asserting the exact list would make this test fail
        # for reasons that have nothing to do with the filter.
        assert "有争议" in names
        assert "无争议" not in names
        assert "被并入" not in names  # absorbed by the merge

    def test_the_response_says_how_many_there_are_in_total(self, client):
        for i in range(3):
            make_player(client, last_name="测", first_name=f"计数{i}")

        response = client.get("/api/players?limit=2", headers=READ)

        # A page that shows two of three while a badge elsewhere says "3" is
        # fine; a badge that says "2" because that is all it fetched is a wrong
        # number presented as a fact.
        assert len(response.json()) == 2
        assert int(response.headers["X-Total-Count"]) >= 3

    def test_the_default_limit_is_reported_too(self, client):
        make_player(client, last_name="测", first_name="甲")

        response = client.get("/api/players", headers=READ)

        assert "X-Total-Count" in response.headers
