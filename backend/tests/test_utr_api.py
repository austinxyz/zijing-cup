"""The two endpoints behind the current-UTR round trip.

One read — the rows a team's sheet is built from — and one write, which takes
`(id, fields)` pairs and applies them in a single transaction. The write is
deliberately narrow: it touches five columns and nothing else, because the
sheet's whole safety argument rests on the name in each row still matching the
id beside it, and an import that could rewrite names would erase that.

All names are invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
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
    Team,
)

READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}

TEST_YEAR = 1991  # reserved for this module

#: (last, first, gender, participation UTR)
ROWS = [
    ("南", "望舒", "M", "7.24"),
    ("西", "门吹雪", "F", "4.90"),
    ("北", "冥子", "M", "6.10"),
]


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
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()


@pytest.fixture()
def client():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="UTR 表测试赛季"))
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
        team = Team(season_year=TEST_YEAR, division_code="silver", code="UTR-A")
        session.add(team)
        session.commit()
        session.refresh(team)

        for last, first, gender, utr in ROWS:
            person = Player(last_name=last, first_name=first, gender=gender)
            session.add(person)
            session.commit()
            session.refresh(person)
            session.add(
                PlayerTeamMembership(player_id=person.id, team_id=team.id)
            )
            session.add(
                PlayerSeasonUtr(
                    player_id=person.id,
                    season_year=TEST_YEAR,
                    value=Decimal(utr),
                    status="verified",
                    source="committee_sheet",
                )
            )
        session.commit()

    yield TestClient(app)

    with Session(engine) as session:
        _cleanup(session)


def sheet_url(team: str = "UTR-A") -> str:
    return (
        f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/{team}/utr-sheet"
    )


class TestExportRows:
    def test_returns_a_row_per_player_with_its_id(self, client):
        response = client.get(sheet_url(), headers=READ)
        assert response.status_code == 200

        rows = response.json()
        assert len(rows) == len(ROWS)
        first = rows[0]
        assert first["player_id"] > 0
        for field in [
            "last_name",
            "first_name",
            "singles_utr",
            "singles_status",
            "doubles_utr",
            "doubles_status",
            "utr_profile_id",
        ]:
            assert field in first

    def test_unknown_team_is_404(self, client):
        assert client.get(sheet_url("NOPE"), headers=READ).status_code == 404

    def test_rows_come_in_the_same_order_as_the_roster_page(self, client):
        # The person exports this while looking at the roster. Two different
        # orders would read as having exported the wrong team.
        sheet = client.get(sheet_url(), headers=READ).json()
        roster = client.get(
            f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/UTR-A/roster",
            headers=READ,
        ).json()

        assert [(r["last_name"], r["first_name"]) for r in sheet] == [
            (p["last_name"], p["first_name"]) for p in roster["players"]
        ]


def ids_by_name(client) -> dict[str, int]:
    return {r["first_name"]: r["player_id"] for r in client.get(sheet_url(), headers=READ).json()}


class TestBatchWrite:
    def test_writes_every_change_in_the_batch(self, client):
        ids = ids_by_name(client)
        response = client.put(
            "/api/players/current-utr",
            headers=WRITE,
            json={
                "updates": [
                    {
                        "player_id": ids["望舒"],
                        "singles_utr": "6.90",
                        "singles_status": "rated",
                    },
                    {
                        "player_id": ids["冥子"],
                        "doubles_utr": "6.40",
                        "doubles_status": "projected",
                    },
                ]
            },
        )
        assert response.status_code == 200

        rows = {r["first_name"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert rows["望舒"]["singles_utr"] == "6.90"
        assert rows["冥子"]["doubles_status"] == "projected"

    def test_one_bad_id_rolls_the_whole_batch_back(self, client):
        # Half-written is worse than not written: the person has no record of
        # which half landed.
        ids = ids_by_name(client)
        response = client.put(
            "/api/players/current-utr",
            headers=WRITE,
            json={
                "updates": [
                    {
                        "player_id": ids["望舒"],
                        "singles_utr": "6.90",
                        "singles_status": "rated",
                    },
                    {"player_id": 999999, "singles_utr": "5.00"},
                ]
            },
        )
        assert response.status_code >= 400

        rows = {r["first_name"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert rows["望舒"]["singles_utr"] is None

    def test_a_name_smuggled_into_the_body_is_ignored(self, client):
        # The sheet's safety rests on the name beside each id still matching.
        # An import that could rewrite names would quietly disarm that check.
        ids = ids_by_name(client)
        client.put(
            "/api/players/current-utr",
            headers=WRITE,
            json={
                "updates": [
                    {
                        "player_id": ids["望舒"],
                        "singles_utr": "6.90",
                        "singles_status": "rated",
                        "last_name": "毛",
                        "gender": "F",
                    }
                ]
            },
        )

        rows = {r["player_id"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert rows[ids["望舒"]]["last_name"] == "南"

    def test_a_locked_season_does_not_block_a_current_utr(self, client):
        # The lock freezes participation UTRs. A current UTR belongs to the
        # player, not to any season, so it is not what the lock is about.
        from app.models import SeasonLock

        with Session(engine) as session:
            session.add(SeasonLock(season_year=TEST_YEAR))
            session.commit()

        ids = ids_by_name(client)
        response = client.put(
            "/api/players/current-utr",
            headers=WRITE,
            json={
                "updates": [
                    {
                        "player_id": ids["望舒"],
                        "singles_utr": "6.90",
                        "singles_status": "rated",
                    }
                ]
            },
        )

        assert response.status_code == 200

    def test_the_shared_secret_alone_is_not_enough(self, client):
        ids = ids_by_name(client)
        response = client.put(
            "/api/players/current-utr",
            headers=READ,
            json={"updates": [{"player_id": ids["望舒"], "singles_utr": "6.90"}]},
        )

        assert response.status_code == 403


class TestAcrossDivisions:
    def test_a_change_shows_up_on_the_other_divisions_team_too(self, client):
        # A current UTR belongs to the player, not to a team or a season. One
        # person, one number — but reached from either side, which is exactly
        # why the confirmation screen has to name these people.
        with Session(engine) as session:
            session.add(
                Division(
                    season_year=TEST_YEAR,
                    code="gold",
                    display_name="金组",
                    scoring_mode="match_count",
                    partner_gap_max=Decimal("3.50"),
                )
            )
            session.commit()
            gold = Team(
                season_year=TEST_YEAR, division_code="gold", code="UTR-G"
            )
            session.add(gold)
            session.commit()
            session.refresh(gold)
            person = session.exec(
                select(Player).where(Player.first_name == "望舒")
            ).one()
            # One season UTR per (player, season) already exists; a player on
            # two teams shares it, which is the point.
            session.add(
                PlayerTeamMembership(player_id=person.id, team_id=gold.id)
            )
            session.commit()
            shared_id = person.id

        client.put(
            "/api/players/current-utr",
            headers=WRITE,
            json={
                "updates": [
                    {
                        "player_id": shared_id,
                        "doubles_utr": "6.72",
                        "doubles_status": "rated",
                    }
                ]
            },
        )

        gold_rows = client.get(
            f"/api/seasons/{TEST_YEAR}/divisions/gold/teams/UTR-G/utr-sheet",
            headers=READ,
        ).json()
        assert gold_rows[0]["doubles_utr"] == "6.72"

    def test_the_sheet_reports_who_else_is_on_another_division(self, client):
        with Session(engine) as session:
            session.add(
                Division(
                    season_year=TEST_YEAR,
                    code="gold",
                    display_name="金组",
                    scoring_mode="match_count",
                    partner_gap_max=Decimal("3.50"),
                )
            )
            session.commit()
            gold = Team(
                season_year=TEST_YEAR, division_code="gold", code="UTR-G"
            )
            session.add(gold)
            session.commit()
            session.refresh(gold)
            person = session.exec(
                select(Player).where(Player.first_name == "望舒")
            ).one()
            session.add(
                PlayerTeamMembership(player_id=person.id, team_id=gold.id)
            )
            session.commit()
            shared_id = person.id

        response = client.get(
            f"{sheet_url()}/elsewhere",
            headers=READ,
        )

        assert response.status_code == 200
        assert response.json() == {str(shared_id): ["gold · UTR-G"]}


class TestPreviewAndApply:
    def _sheet_text(self, client, **cells) -> str:
        rows = client.get(sheet_url(), headers=READ).json()
        header = "id\t姓\t名\t当前单打\t单打状态\t当前双打\t双打状态\tUTR链接"
        lines = [header]
        for row in rows:
            values = cells.get(row["first_name"], ["", "", "", "", ""])
            lines.append(
                "\t".join(
                    [str(row["player_id"]), row["last_name"], row["first_name"], *values]
                )
            )
        return "\n".join(lines)

    def test_preview_reports_the_change_without_writing_it(self, client):
        text = self._sheet_text(client, 望舒=["6.90", "rated", "", "", ""])

        body = client.post(
            f"{sheet_url()}/preview", headers=WRITE, json={"text": text}
        ).json()

        assert body["applicable"] is True
        assert body["counts"]["singles_utr"] == 1
        assert body["covered"] == 3
        assert body["not_covered"] == 0

        after = {r["first_name"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert after["望舒"]["singles_utr"] is None

    def test_preview_carries_the_errors_and_refuses_to_be_applicable(self, client):
        text = self._sheet_text(client, 望舒=["6.90", "已认证", "", "", ""])

        body = client.post(
            f"{sheet_url()}/preview", headers=WRITE, json={"text": text}
        ).json()

        assert body["applicable"] is False
        assert len(body["errors"]) == 1

    def test_apply_writes_what_preview_showed(self, client):
        text = self._sheet_text(client, 望舒=["6.90", "rated", "", "", ""])

        response = client.post(
            f"{sheet_url()}/apply", headers=WRITE, json={"text": text}
        )
        assert response.status_code == 200
        assert response.json()["updated"] == 1

        after = {r["first_name"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert after["望舒"]["singles_utr"] == "6.90"

    def test_apply_refuses_a_sheet_with_any_error(self, client):
        text = self._sheet_text(client, 望舒=["6.90", "已认证", "", "", ""])

        response = client.post(
            f"{sheet_url()}/apply", headers=WRITE, json={"text": text}
        )

        assert response.status_code == 422
        after = {r["first_name"]: r for r in client.get(sheet_url(), headers=READ).json()}
        assert after["望舒"]["singles_utr"] is None
