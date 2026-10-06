"""Match records: store a played tie (our team vs an opponent in the same
division), per-line on-court players for both sides, per-line win/loss + note.

Our-side lineup is an independent snapshot ({line: [player keys]}), not a FK to a
saved lineup; `source_lineup_id` is a plain nullable int (NO FK) kept only for
provenance. Opponent per-line players reference the opponent roster's player ids,
nullable where they cannot be matched. Whole-tie outcome is DERIVED from per-line
results by the division's scoring_mode, never stored.

Writes are guarded by the method-keyed admin middleware; reads sit behind the
backend secret. All names/ids invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import Division, DivisionLine, Season, Team

TEST_YEAR = 2998
DIV = "silver"
READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}
BASE = f"/api/seasons/{TEST_YEAR}/divisions/{DIV}/matches"


def _purge(session: Session) -> None:
    from app.models import MatchRecord  # imported lazily until it exists

    for model in (MatchRecord, DivisionLine, Division, Team, Season):
        session.exec(delete(model))
    session.commit()


@pytest.fixture()
def setup():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="比赛记录测试赛季"))
        session.commit()
        div = Division(
            season_year=TEST_YEAR, code=DIV, display_name="银组",
            scoring_mode="match_count", partner_gap_max=Decimal("3.50"),
        )
        session.add(div)
        session.commit()
        session.refresh(div)
        for code, kind, order in (
            ("D1", "mens_doubles", 1),
            ("MD", "mixed_doubles", 4),
            ("WD", "womens_doubles", 5),
        ):
            session.add(DivisionLine(
                division_id=div.id, code=code, kind=kind, sort_order=order, points=1,
            ))
        our = Team(season_year=TEST_YEAR, division_code=DIV, code="UCSD-ZJU")
        opp = Team(season_year=TEST_YEAR, division_code=DIV, code="THU-MIT")
        session.add(our)
        session.add(opp)
        session.commit()
        session.refresh(our)
        session.refresh(opp)
        ids = {"our": our.id, "opp": opp.id}
    yield ids
    with Session(engine) as session:
        _purge(session)


@pytest.fixture()
def client(setup):
    yield TestClient(app)


def _payload(**over):
    body = {
        "our_team_code": "UCSD-ZJU",
        "opponent_team_code": "THU-MIT",
        "match_date": "2026-09-28",
        "round_label": "小组赛第2轮",
        "source_lineup_id": None,
        "lines": {
            "D1": {"our": ["p1", "p2"], "opp": [11, None], "outcome": "win", "note": "抢七险胜"},
            "MD": {"our": ["p3", "p4"], "opp": [12, 13], "outcome": "loss", "note": ""},
        },
    }
    body.update(over)
    return body


def test_match_record_roundtrips_with_lines_and_nullable_source(setup):
    from app.models import MatchRecord

    with Session(engine) as session:
        row = MatchRecord(
            season_year=TEST_YEAR,
            division_code=DIV,
            our_team_id=setup["our"],
            opponent_team_id=setup["opp"],
            match_date=date(2026, 9, 28),
            round_label="小组赛第2轮",
            source_lineup_id=None,
            lines={
                "D1": {"our": ["p1", "p2"], "opp": [11, None], "outcome": "win", "note": "抢七险胜"},
                "MD": {"our": ["p3", "p4"], "opp": [12, 13], "outcome": "loss", "note": ""},
            },
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        rid = row.id

    with Session(engine) as session:
        got = session.exec(select(MatchRecord).where(MatchRecord.id == rid)).one()
        assert got.match_date == date(2026, 9, 28)
        assert got.round_label == "小组赛第2轮"
        assert got.source_lineup_id is None
        assert got.lines["D1"]["opp"] == [11, None]
        assert got.lines["D1"]["outcome"] == "win"
        assert got.created_at is not None


class TestCreateValidation:
    def test_create_stores_record(self, client):
        r = client.post(BASE, headers=WRITE, json=_payload())
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body["opponent_team_code"] == "THU-MIT"
        assert body["lines"]["D1"]["opp"] == [11, None]

    def test_create_needs_admin(self, client):
        assert client.post(BASE, headers=READ, json=_payload()).status_code == 403

    def test_reject_bad_outcome(self, client):
        p = _payload()
        p["lines"]["D1"]["outcome"] = "draw"
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_reject_our_not_two_keys(self, client):
        p = _payload()
        p["lines"]["D1"]["our"] = ["p1"]
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_reject_cross_division_opponent(self, client):
        assert client.post(BASE, headers=WRITE,
                           json=_payload(opponent_team_code="NOPE")).status_code in (404, 422)

    def test_reject_self_opponent(self, client):
        assert client.post(BASE, headers=WRITE,
                           json=_payload(opponent_team_code="UCSD-ZJU")).status_code == 422

    def test_reject_unknown_line(self, client):
        p = _payload()
        p["lines"]["ZZ"] = {"our": ["p9", "p8"], "opp": [1, 2], "outcome": "win", "note": ""}
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422


class TestOutcome:
    def test_match_count_counts_won_lines(self):
        from app.matches.service import compute_outcome
        lines = {
            "D1": {"outcome": "win"}, "D2": {"outcome": "win"}, "D3": {"outcome": "win"},
            "WD": {"outcome": "loss"}, "MD": {"outcome": "loss"},
        }
        out = compute_outcome(lines, {}, "match_count")
        assert out["our"] == 3 and out["opponent"] == 2

    def test_points_weights_by_line(self):
        from app.matches.service import compute_outcome
        lines = {"D1": {"outcome": "win"}, "MD": {"outcome": "loss"}}
        out = compute_outcome(lines, {"D1": 2, "MD": 3}, "points")
        assert out["our"] == 2 and out["opponent"] == 3

    def test_partial_counts_only_recorded_lines(self):
        from app.matches.service import compute_outcome
        lines = {"D1": {"outcome": "win"}, "MD": {}}  # MD not yet recorded
        out = compute_outcome(lines, {}, "match_count")
        assert out["our"] == 1 and out["opponent"] == 0

    def test_get_includes_derived_outcome(self, client):
        mid = client.post(BASE, headers=WRITE, json=_payload()).json()["id"]
        got = client.get(f"{BASE}/{mid}", headers=READ)
        assert got.status_code == 200, got.text
        # silver _payload: D1 win, MD loss -> 1-1
        assert got.json()["outcome"]["our"] == 1
        assert got.json()["outcome"]["opponent"] == 1


class TestListAndDetail:
    def test_list_filters_by_team(self, client):
        client.post(BASE, headers=WRITE, json=_payload())
        rows = client.get(BASE, headers=READ, params={"team": "UCSD-ZJU"}).json()
        assert len(rows) == 1
        assert rows[0]["opponent_team_code"] == "THU-MIT"
        other = client.get(BASE, headers=READ, params={"team": "THU-MIT"}).json()
        # THU-MIT is the opponent, so a team filter on it still finds this tie
        assert len(other) == 1

    def test_list_filters_by_opponent(self, client):
        client.post(BASE, headers=WRITE, json=_payload())
        assert len(client.get(BASE, headers=READ, params={"opponent": "THU-MIT"}).json()) == 1
        assert client.get(BASE, headers=READ, params={"opponent": "UCSD-ZJU"}).json() == []

    def test_detail_preserves_null_opp_and_note(self, client):
        mid = client.post(BASE, headers=WRITE, json=_payload()).json()["id"]
        d = client.get(f"{BASE}/{mid}", headers=READ).json()
        assert d["lines"]["D1"]["opp"] == [11, None]
        assert d["lines"]["D1"]["note"] == "抢七险胜"

    def test_source_lineup_id_kept_without_fk(self, client):
        # No saved lineup with id 777 exists; the record must store it anyway
        # (provenance only, NO FK) and stay complete.
        mid = client.post(BASE, headers=WRITE, json=_payload(source_lineup_id=777)).json()["id"]
        d = client.get(f"{BASE}/{mid}", headers=READ).json()
        assert d["source_lineup_id"] == 777
        assert d["lines"]["MD"]["our"] == ["p3", "p4"]

    def test_delete_needs_admin(self, client):
        mid = client.post(BASE, headers=WRITE, json=_payload()).json()["id"]
        assert client.delete(f"{BASE}/{mid}", headers=READ).status_code == 403

    def test_delete_removes(self, client):
        mid = client.post(BASE, headers=WRITE, json=_payload()).json()["id"]
        assert client.delete(f"{BASE}/{mid}", headers=WRITE).status_code == 204
        assert client.get(BASE, headers=READ).json() == []


class TestLineShapeValidation:
    def test_reject_opp_not_two_slots(self, client):
        p = _payload()
        p["lines"]["D1"]["opp"] = [11, 12, 13]
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_reject_our_bad_key_format(self, client):
        p = _payload()
        p["lines"]["D1"]["our"] = ["p1", "garbage"]
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_reject_round_label_overflow(self, client):
        assert client.post(BASE, headers=WRITE,
                           json=_payload(round_label="x" * 61)).status_code == 422

    def test_reject_duplicate_our_key(self, client):
        p = _payload()
        p["lines"]["D1"]["our"] = ["p1", "p1"]
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422


class TestPlayerResolution:
    def _seed_players(self):
        """Put 4 players on our team + 2 on opponent, return their keys/ids."""
        from app.models import Player, PlayerTeamMembership
        with Session(engine) as s:
            ids = {}
            for tag, (ln, fn, g) in {
                "a": ("Chen", "Yilun", "M"), "b": ("Wu", "Qiang", "M"),
                "c": ("Liu", "Yang", "M"), "d": ("Wang", "Fang", "F"),
                "o1": ("Li", "Ming", "M"), "o2": ("Ma", "Dong", "M"),
            }.items():
                p = Player(last_name=ln, first_name=fn, gender=g)
                s.add(p); s.commit(); s.refresh(p)
                ids[tag] = p.id
            our = s.exec(select(Team).where(Team.code == "UCSD-ZJU")).one()
            opp = s.exec(select(Team).where(Team.code == "THU-MIT")).one()
            for tag in ("a", "b", "c", "d"):
                s.add(PlayerTeamMembership(player_id=ids[tag], team_id=our.id))
            for tag in ("o1", "o2"):
                s.add(PlayerTeamMembership(player_id=ids[tag], team_id=opp.id))
            s.commit()
            return ids

    def test_detail_resolves_player_names(self, client):
        ids = self._seed_players()
        p = _payload(lines={
            "D1": {"our": [f"p{ids['a']}", f"p{ids['b']}"],
                   "opp": [ids["o1"], ids["o2"]], "outcome": "win", "note": ""},
        })
        mid = client.post(BASE, headers=WRITE, json=p).json()["id"]
        d = client.get(f"{BASE}/{mid}", headers=READ).json()
        d1 = d["lines"]["D1"]
        names = {pl["last_name"] for pl in d1["our_players"]}
        assert names == {"Chen", "Wu"}
        assert d1["opp_players"][0]["last_name"] == "Li"

    def test_unmatched_opp_resolves_to_null(self, client):
        ids = self._seed_players()
        p = _payload(lines={
            "D1": {"our": [f"p{ids['a']}", f"p{ids['b']}"],
                   "opp": [ids["o1"], None], "outcome": "win", "note": ""},
        })
        mid = client.post(BASE, headers=WRITE, json=p).json()["id"]
        d = client.get(f"{BASE}/{mid}", headers=READ).json()
        assert d["lines"]["D1"]["opp_players"][1] is None


class TestMoreValidation:
    def test_reject_note_too_long(self, client):
        p = _payload()
        p["lines"]["D1"]["note"] = "x" * 501
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_reject_opponent_from_other_division(self, client):
        # A real team that exists, but in a different division -> not a valid
        # opponent for this (season, division).
        with Session(engine) as s:
            s.add(Division(season_year=TEST_YEAR, code="gold", display_name="金组",
                           scoring_mode="points", partner_gap_max=Decimal("3.50")))
            s.commit()  # division must exist before the team's composite FK
            s.add(Team(season_year=TEST_YEAR, division_code="gold", code="GOLD-ONLY"))
            s.commit()
        assert client.post(BASE, headers=WRITE,
                           json=_payload(opponent_team_code="GOLD-ONLY")).status_code == 422
        with Session(engine) as s:
            from app.models import MatchRecord
            s.exec(delete(MatchRecord)); s.commit()
            for t in s.exec(select(Team).where(Team.division_code == "gold")).all():
                s.delete(t)
            for dv in s.exec(select(Division).where(Division.code == "gold")).all():
                s.delete(dv)
            s.commit()


class TestGoldScoring:
    def test_gold_points_weighted_end_to_end(self):
        """Full create+read on a points division, verifying weighted outcome."""
        from app.models import MatchRecord
        YEAR, D = 2997, "gold"
        with Session(engine) as s:
            for m in (MatchRecord, DivisionLine, Division, Team, Season):
                s.exec(delete(m).where(getattr(m, "season_year", None) == YEAR)) if hasattr(m, "season_year") else None
            s.add(Season(year=YEAR, edition_name="金组计分测试"))
            s.commit()
            dv = Division(season_year=YEAR, code=D, display_name="金组",
                          scoring_mode="points", partner_gap_max=Decimal("3.50"))
            s.add(dv); s.commit(); s.refresh(dv)
            s.add(DivisionLine(division_id=dv.id, code="D1", kind="mens_doubles", sort_order=1, points=2))
            s.add(DivisionLine(division_id=dv.id, code="MD", kind="mixed_doubles", sort_order=4, points=3))
            s.add(Team(season_year=YEAR, division_code=D, code="G-OUR"))
            s.add(Team(season_year=YEAR, division_code=D, code="G-OPP"))
            s.commit()
        try:
            c = TestClient(app)
            base = f"/api/seasons/{YEAR}/divisions/{D}/matches"
            body = {
                "our_team_code": "G-OUR", "opponent_team_code": "G-OPP",
                "match_date": "2026-09-28", "round_label": None, "source_lineup_id": None,
                "lines": {
                    "D1": {"our": ["p1", "p2"], "opp": [None, None], "outcome": "win", "note": ""},
                    "MD": {"our": ["p3", "p4"], "opp": [None, None], "outcome": "loss", "note": ""},
                },
            }
            mid = c.post(base, headers=WRITE, json=body).json()["id"]
            out = c.get(f"{base}/{mid}", headers=READ).json()["outcome"]
            assert out["our"] == 2 and out["opponent"] == 3  # D1 win=2pts, MD loss=3pts
        finally:
            with Session(engine) as s:
                s.exec(delete(MatchRecord))
                s.commit()
                for t in s.exec(select(Team).where(Team.season_year == YEAR)).all():
                    s.delete(t)
                for ln in s.exec(select(DivisionLine)).all():
                    dvx = s.get(Division, ln.division_id)
                    if dvx and dvx.season_year == YEAR:
                        s.delete(ln)
                s.commit()
                for dvx in s.exec(select(Division).where(Division.season_year == YEAR)).all():
                    s.delete(dvx)
                s.commit()
                sea = s.get(Season, YEAR)
                if sea:
                    s.delete(sea); s.commit()


class TestGenderRules:
    def _seed(self):
        """2 men + 2 women on our team, 2 men on opponent. Returns keys/ids."""
        from app.models import Player, PlayerTeamMembership
        with Session(engine) as s:
            ids = {}
            for tag, g in {"m1": "M", "m2": "M", "w1": "F", "w2": "F"}.items():
                p = Player(last_name=tag.upper(), first_name="X", gender=g)
                s.add(p); s.commit(); s.refresh(p); ids[tag] = p.id
            for tag, g in {"om1": "M", "om2": "M"}.items():
                p = Player(last_name=tag.upper(), first_name="X", gender=g)
                s.add(p); s.commit(); s.refresh(p); ids[tag] = p.id
            our = s.exec(select(Team).where(Team.code == "UCSD-ZJU")).one()
            opp = s.exec(select(Team).where(Team.code == "THU-MIT")).one()
            for tag in ("m1", "m2", "w1", "w2"):
                s.add(PlayerTeamMembership(player_id=ids[tag], team_id=our.id))
            for tag in ("om1", "om2"):
                s.add(PlayerTeamMembership(player_id=ids[tag], team_id=opp.id))
            s.commit()
            return ids

    def _line(self, a, b, outcome="win"):
        return {"our": [f"p{a}", f"p{b}"], "opp": [None, None], "outcome": outcome, "note": ""}

    def test_mixed_rejects_two_men(self, client):
        i = self._seed()
        p = _payload(lines={"MD": self._line(i["m1"], i["m2"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_mixed_allows_two_women(self, client):
        i = self._seed()
        p = _payload(lines={"MD": self._line(i["w1"], i["w2"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code in (200, 201)

    def test_mixed_allows_one_each(self, client):
        i = self._seed()
        p = _payload(lines={"MD": self._line(i["m1"], i["w1"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code in (200, 201)

    def test_womens_rejects_a_man(self, client):
        i = self._seed()
        p = _payload(lines={"WD": self._line(i["m1"], i["w1"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code == 422

    def test_womens_allows_two_women(self, client):
        i = self._seed()
        p = _payload(lines={"WD": self._line(i["w1"], i["w2"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code in (200, 201)

    def test_mens_doubles_allows_a_woman(self, client):
        i = self._seed()
        p = _payload(lines={"D1": self._line(i["m1"], i["w1"])})
        assert client.post(BASE, headers=WRITE, json=p).status_code in (200, 201)

    def test_mixed_opponent_two_men_rejected_when_resolved(self, client):
        i = self._seed()
        line = {"our": [f"p{i['m1']}", f"p{i['w1']}"], "opp": [i["om1"], i["om2"]],
                "outcome": "win", "note": ""}
        assert client.post(BASE, headers=WRITE, json=_payload(lines={"MD": line})).status_code == 422
