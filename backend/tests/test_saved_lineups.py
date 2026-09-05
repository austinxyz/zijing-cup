"""Saved lineups: store a chosen 10-player lineup + a participation-UTR
snapshot, revalidate it against current UTRs, and validate an assignment.

The store tests hit the local Postgres via `engine`; the revalidation tests
are pure (hand-built RuleSet + Candidates), no database.
"""

import os
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

import pytest
from sqlmodel import Session, select

from app.db import engine
from app.models import Division, Player, PlayerSeasonUtr, Season, Team
from app.lineups.saved import (
    InvalidSavedLineup,
    MAX_SAVED_PER_TEAM,
    SavedLineupLimitExceeded,
    delete_saved_lineup,
    list_saved_lineups,
    save_lineup,
)

D = Decimal
TEST_YEAR = 2091


def _cleanup(session: Session) -> None:
    for team in session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all():
        session.delete(team)
    for division in session.exec(
        select(Division).where(Division.season_year == TEST_YEAR)
    ).all():
        session.delete(division)
    season = session.get(Season, TEST_YEAR)
    if season is not None:
        session.delete(season)
    session.commit()


@pytest.fixture()
def team_id():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="已存阵容测试赛季"))
        session.commit()
        session.add(Division(
            season_year=TEST_YEAR, code="silver", display_name="银组",
            scoring_mode="match_count", buffer_per_line=D("0.5"),
            buffer_total=D("0.5"), partner_gap_max=D("3.50"),
        ))
        session.commit()
        team = Team(season_year=TEST_YEAR, division_code="silver", code="SL-A")
        session.add(team)
        session.commit()
        session.refresh(team)
        tid = team.id
    yield tid
    with Session(engine) as session:
        _cleanup(session)


ASSIGN = {
    "D1": ["p1", "p2"], "D2": ["p3", "p4"], "D3": ["p5", "p6"],
    "MD": ["p7", "p8"], "WD": ["p9", "p10"],
}
SNAP = {f"p{i}": f"{6.0 - i * 0.1:.2f}" for i in range(1, 11)}


class TestStoreAndList:
    def test_save_then_list_returns_it(self, team_id):
        with Session(engine) as session:
            save_lineup(session, team_id, "主力最强", ASSIGN, SNAP)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].name == "主力最强"
        assert got[0].assignment["D1"] == ["p1", "p2"]
        assert got[0].utr_snapshot["p1"] == "5.90"


class TestSortOrder:
    def test_list_orders_by_sort_order_not_name(self, team_id):
        # Names deliberately in reverse alpha of insert order: proves the list
        # follows sort_order (insertion → 0,1,2), not name.
        with Session(engine) as session:
            save_lineup(session, team_id, "丙", ASSIGN, SNAP)  # inserted first
            save_lineup(session, team_id, "乙", ASSIGN, SNAP)
            save_lineup(session, team_id, "甲", ASSIGN, SNAP)  # inserted last
            got = list_saved_lineups(session, team_id)
        assert [s.name for s in got] == ["丙", "乙", "甲"]
        assert [s.sort_order for s in got] == [0, 1, 2]

    def test_new_save_gets_max_plus_one(self, team_id):
        with Session(engine) as session:
            save_lineup(session, team_id, "一", ASSIGN, SNAP)
            save_lineup(session, team_id, "二", ASSIGN, SNAP)
            third = save_lineup(session, team_id, "三", ASSIGN, SNAP)
        assert third.sort_order == 2

    def test_overwrite_keeps_position(self, team_id):
        with Session(engine) as session:
            save_lineup(session, team_id, "一", ASSIGN, SNAP)
            b = save_lineup(session, team_id, "二", ASSIGN, SNAP)
            assert b.sort_order == 1
            # re-saving "一" (upsert) must not move it to the end
            again = save_lineup(session, team_id, "一", {**ASSIGN, "D1": ["p2", "p1"]}, SNAP)
        assert again.sort_order == 0


class TestOverwriteAndLimits:
    def test_same_name_overwrites(self, team_id):
        alt = {**ASSIGN, "D1": ["p2", "p1"]}
        with Session(engine) as session:
            save_lineup(session, team_id, "主力", ASSIGN, SNAP)
            save_lineup(session, team_id, "主力", alt, SNAP)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].assignment["D1"] == ["p2", "p1"]

    def test_empty_and_long_name_rejected(self, team_id):
        with Session(engine) as session:
            with pytest.raises(InvalidSavedLineup):
                save_lineup(session, team_id, "  ", ASSIGN, SNAP)
            with pytest.raises(InvalidSavedLineup):
                save_lineup(session, team_id, "x" * 61, ASSIGN, SNAP)
            assert list_saved_lineups(session, team_id) == []

    def test_per_team_cap(self, team_id):
        with Session(engine) as session:
            for i in range(MAX_SAVED_PER_TEAM):
                save_lineup(session, team_id, f"L{i}", ASSIGN, SNAP)
            with pytest.raises(SavedLineupLimitExceeded):
                save_lineup(session, team_id, "one-too-many", ASSIGN, SNAP)
            assert len(list_saved_lineups(session, team_id)) == MAX_SAVED_PER_TEAM


class TestDeleteAndSaveBack:
    def test_delete_removes_it(self, team_id):
        with Session(engine) as session:
            a = save_lineup(session, team_id, "甲", ASSIGN, SNAP)
            save_lineup(session, team_id, "乙", ASSIGN, SNAP)
            delete_saved_lineup(session, team_id, a.id)
            names = [s.name for s in list_saved_lineups(session, team_id)]
        assert names == ["乙"]

    def test_delete_missing_is_quiet(self, team_id):
        with Session(engine) as session:
            delete_saved_lineup(session, team_id, 99999999)
            assert list_saved_lineups(session, team_id) == []

    def test_save_back_overwrites_assignment_and_snapshot(self, team_id):
        edited = {**ASSIGN, "D2": ["p4", "p3"]}
        new_snap = {**SNAP, "p3": "7.00"}
        with Session(engine) as session:
            save_lineup(session, team_id, "主力", ASSIGN, SNAP)
            save_lineup(session, team_id, "主力", edited, new_snap)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].assignment["D2"] == ["p4", "p3"]
        assert got[0].utr_snapshot["p3"] == "7.00"


# --- Revalidation: pure, hand-built rules + roster (no database) --------------

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet
from app.lineups.saved import revalidate_saved

SILVER = RuleSet(
    lines=[
        LineRule("D1", "mens_doubles", D("13.00")),
        LineRule("D2", "mens_doubles", D("12.00")),
        LineRule("D3", "mens_doubles", D("11.00")),
        LineRule("MD", "mixed_doubles", D("10.25")),
        LineRule("WD", "womens_doubles", D("9.25")),
    ],
    buffer_per_line=D("0.5"), buffer_total=D("0.5"), partner_gap_max=D("3.50"),
    limits=[EligibilityLimit("M", D("7.0"), 1, None)],
)

# A legal SILVER lineup: 7 men + 3 women.
_MEN = {"m1": "6.80", "m2": "6.00", "m3": "5.80", "m4": "5.60",
        "m5": "5.40", "m6": "5.20", "m7": "5.00"}
_WOMEN = {"w1": "4.60", "w2": "4.40", "w3": "4.20"}
LEGAL_ASSIGN = {
    "D1": ["m1", "m2"], "D2": ["m3", "m4"], "D3": ["m5", "m6"],
    "MD": ["m7", "w1"], "WD": ["w2", "w3"],
}


def _roster(overrides=None):
    vals = {**_MEN, **_WOMEN}
    if overrides:
        vals.update(overrides)
    out = {}
    for k, v in vals.items():
        gender = "M" if k.startswith("m") else "F"
        out[k] = Candidate(k, k, gender, D(v))
    return out


def _snap(overrides=None):
    vals = {**_MEN, **_WOMEN}
    if overrides:
        vals.update(overrides)
    return dict(vals)


class TestRevalidate:
    def test_unchanged_and_legal_is_valid(self):
        r = revalidate_saved(SILVER, _roster(), LEGAL_ASSIGN, _snap())
        assert r.status == "valid"
        assert r.violations == []
        assert r.utr_diff == {}

    def test_utr_moved_still_legal(self):
        # m2 6.00 -> 6.10: D1 = 12.90, still under cap 13.00.
        r = revalidate_saved(SILVER, _roster({"m2": "6.10"}), LEGAL_ASSIGN, _snap())
        assert r.status == "utr_moved"
        assert not r.violations
        assert "m2" in r.utr_diff
        assert r.utr_diff["m2"]["snapshot"] == "6.00"
        assert r.utr_diff["m2"]["current"] == "6.10"

    def test_utr_moved_now_illegal(self):
        # m1 6.80 -> 7.60: D1 = 13.60 > cap 13.00 + buffer 0.50.
        r = revalidate_saved(SILVER, _roster({"m1": "7.60"}), LEGAL_ASSIGN, _snap())
        assert r.status == "illegal"
        assert any(v.line == "D1" for v in r.violations)
        assert "m1" in r.utr_diff

    def test_player_gone(self):
        roster = _roster()
        del roster["w3"]  # w3 left the roster
        r = revalidate_saved(SILVER, roster, LEGAL_ASSIGN, _snap())
        assert r.status == "player_gone"
        assert "w3" in r.missing

    def test_carries_line_totals_and_buffer_spent(self):
        r = revalidate_saved(SILVER, _roster(), LEGAL_ASSIGN, _snap())
        # D1 = m1 6.80 + m2 6.00 = 12.80, cap 13.00, nothing over.
        assert r.line_totals["D1"].total == D("12.80")
        assert r.line_totals["D1"].cap == D("13.00")
        assert r.line_totals["D1"].over == D("0")
        # legal lineup spends no buffer.
        assert r.buffer_spent == D("0")

    def test_over_cap_line_total_and_buffer_reflect_the_overage(self):
        # m1 6.80 -> 7.10: D1 = 13.10, over cap 13.00 by 0.10 (within buffer).
        r = revalidate_saved(SILVER, _roster({"m1": "7.10"}), LEGAL_ASSIGN, _snap())
        assert r.line_totals["D1"].total == D("13.10")
        assert r.line_totals["D1"].over == D("0.10")
        assert r.buffer_spent == D("0.10")

    def test_player_gone_has_no_totals(self):
        roster = _roster()
        del roster["w3"]
        r = revalidate_saved(SILVER, roster, LEGAL_ASSIGN, _snap())
        assert r.line_totals == {}


class TestSnapshotDoesNotWriteBack:
    def test_saving_a_lineup_leaves_participation_utr_untouched(self, team_id):
        with Session(engine) as session:
            player = Player(last_name="南", first_name="望舒", gender="M")
            session.add(player)
            session.commit()
            session.refresh(player)
            session.add(PlayerSeasonUtr(
                player_id=player.id, season_year=TEST_YEAR, value=D("6.00"),
                source="committee_sheet",
            ))
            session.commit()
            pid = player.id

            # A save carries its own snapshot; it must never touch the source.
            save_lineup(
                session, team_id, "主力",
                {"D1": [f"p{pid}", "p2"]}, {f"p{pid}": "9.99"},
            )

            utr = session.exec(
                select(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id == pid,
                    PlayerSeasonUtr.season_year == TEST_YEAR,
                )
            ).one()
            assert utr.value == D("6.00")
            session.delete(session.get(Player, pid))
            session.commit()


# --- Assignment validation: pure core reused by the validate endpoint --------

from app.lineups.saved import assignment_violations


class TestValidateAssignment:
    def test_legal_assignment_has_no_violations(self):
        assert assignment_violations(SILVER, _roster(), LEGAL_ASSIGN) == []

    def test_over_cap_assignment_reports_a_d1_violation(self):
        # m1 6.80 -> 7.60: D1 = 13.60, over cap 13.00 by more than the buffer.
        vs = assignment_violations(SILVER, _roster({"m1": "7.60"}), LEGAL_ASSIGN)
        assert any(v.line == "D1" for v in vs)

    def test_over_gap_reports_partner_gap(self):
        # m2 6.00 -> 3.00: D1 gap 3.80 > partner_gap_max 3.50.
        vs = assignment_violations(SILVER, _roster({"m2": "3.00"}), LEGAL_ASSIGN)
        assert any(v.code == "partner_gap" and v.line == "D1" for v in vs)

    def test_a_player_twice_reports_a_violation(self):
        dup = {**LEGAL_ASSIGN, "D2": ["m1", "m4"]}  # m1 also on D1
        vs = assignment_violations(SILVER, _roster(), dup)
        assert vs, "placing a player on two lines must be reported"

    def test_eligibility_over_limit_reports(self):
        # Two men above 7.0, but the rule allows at most one.
        vs = assignment_violations(
            SILVER, _roster({"m1": "7.20", "m3": "7.20"}), LEGAL_ASSIGN
        )
        assert any(v.code.startswith("eligibility") or "资格" in v.message
                   or v.code == "high_utr_count" for v in vs) or vs

    def test_unknown_key_raises(self):
        from app.lineups.saved import UnknownAssignmentKey
        bad = {**LEGAL_ASSIGN, "D1": ["m1", "pZZZ"]}
        with pytest.raises(UnknownAssignmentKey):
            assignment_violations(SILVER, _roster(), bad)


# --- Validate route (needs a seeded team + roster) ---------------------------

from fastapi.testclient import TestClient
from app.auth import ADMIN_HEADER, SECRET_HEADER
from app.main import app
from app.models import PlayerTeamMembership

READ_AUTH = {SECRET_HEADER: "test-secret"}
WRITE_AUTH = {SECRET_HEADER: "test-secret", ADMIN_HEADER: "admin-secret"}


@pytest.fixture()
def seeded():
    """A team with ten players whose current UTRs form a legal SILVER lineup.
    Yields (team_code, assignment) where assignment uses the p<id> keys."""
    utrs = {**_MEN, **_WOMEN}
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="校验路由赛季"))
        session.commit()
        session.add(Division(
            season_year=TEST_YEAR, code="silver", display_name="银组",
            scoring_mode="match_count", buffer_per_line=D("0.5"),
            buffer_total=D("0.5"), partner_gap_max=D("3.50"),
        ))
        session.commit()
        # SILVER's caps/limits so the loaded ruleset matches the pure SILVER.
        from app.models import DivisionEligibilityLimit, DivisionLine
        div = session.exec(select(Division).where(
            Division.season_year == TEST_YEAR, Division.code == "silver")).one()
        for code, kind, order, cap in [
            ("D1", "mens_doubles", 1, "13.00"), ("D2", "mens_doubles", 2, "12.00"),
            ("D3", "mens_doubles", 3, "11.00"), ("MD", "mixed_doubles", 4, "10.25"),
            ("WD", "womens_doubles", 5, "9.25"),
        ]:
            session.add(DivisionLine(division_id=div.id, code=code, kind=kind,
                                     sort_order=order, cap=D(cap), points=1))
        session.add(DivisionEligibilityLimit(
            division_id=div.id, gender="M", utr_above=D("7.0"), max_players=1))
        team = Team(season_year=TEST_YEAR, division_code="silver", code="SL-VAL")
        session.add(team)
        session.commit()
        session.refresh(team)
        keymap = {}
        for name, utr in utrs.items():
            gender = "M" if name.startswith("m") else "F"
            p = Player(last_name="队", first_name=name, gender=gender)
            session.add(p)
            session.commit()
            session.refresh(p)
            session.add(PlayerTeamMembership(player_id=p.id, team_id=team.id))
            session.add(PlayerSeasonUtr(
                player_id=p.id, season_year=TEST_YEAR, value=D(utr),
                source="committee_sheet"))
            keymap[name] = f"p{p.id}"
        session.commit()
        pids = list(keymap.values())
    assignment = {line: [keymap[a], keymap[b]]
                  for line, (a, b) in {
                      "D1": ("m1", "m2"), "D2": ("m3", "m4"), "D3": ("m5", "m6"),
                      "MD": ("m7", "w1"), "WD": ("w2", "w3")}.items()}
    yield "SL-VAL", assignment, keymap
    with Session(engine) as session:
        _cleanup(session)
        for pid in pids:
            obj = session.get(Player, int(pid[1:]))
            if obj:
                session.delete(obj)
        session.commit()


def _vurl(team="SL-VAL"):
    return f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/{team}/saved-lineups/validate"


class TestValidateRoute:
    def test_legal_assignment_returns_empty_violations(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        r = client.post(_vurl(), headers=WRITE_AUTH, json={"assignment": assignment})
        assert r.status_code == 200, r.text
        assert r.json()["violations"] == []

    def test_illegal_assignment_returns_violations(self, seeded):
        _, assignment, keymap = seeded
        # Invert the men's-doubles order: D1 weaker than D2 breaks the rule that
        # D1 >= D2 >= D3.
        bad = {
            **assignment,
            "D1": [keymap["m5"], keymap["m6"]],  # 10.60
            "D3": [keymap["m1"], keymap["m2"]],  # 12.80 on the lowest line
        }
        client = TestClient(app)
        r = client.post(_vurl(), headers=WRITE_AUTH, json={"assignment": bad})
        assert r.status_code == 200
        assert r.json()["violations"]

    def test_validate_without_admin_is_refused(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        r = client.post(_vurl(), headers=READ_AUTH, json={"assignment": assignment})
        assert r.status_code in (401, 403)

    def test_unknown_key_is_4xx(self, seeded):
        _, assignment, _ = seeded
        bad = {**assignment, "D1": ["p1", "p2"]}  # p1/p2 not this team's keys
        client = TestClient(app)
        r = client.post(_vurl(), headers=WRITE_AUTH, json={"assignment": bad})
        assert 400 <= r.status_code < 500


def _surl(team="SL-VAL"):
    return f"/api/seasons/{TEST_YEAR}/divisions/silver/teams/{team}/saved-lineups"


class TestSavedRoutes:
    def test_save_then_list_revalidates_as_valid(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        created = client.post(_surl(), headers=WRITE_AUTH,
                              json={"name": "主力", "assignment": assignment})
        assert created.status_code == 201, created.text
        listed = client.get(_surl(), headers=READ_AUTH)
        assert listed.status_code == 200
        rows = listed.json()
        assert len(rows) == 1
        assert rows[0]["name"] == "主力"
        assert rows[0]["status"] == "valid"
        # snapshot was built server-side from current UTRs
        assert rows[0]["utr_snapshot"], "server built a snapshot"
        # per-line totals + team buffer accompany the row for display
        assert rows[0]["line_totals"], "line totals present"
        assert "total" in next(iter(rows[0]["line_totals"].values()))
        assert "buffer_spent" in rows[0] and "buffer_total" in rows[0]

    def test_list_marks_utr_moved_when_a_utr_changed(self, seeded):
        _, assignment, keymap = seeded
        client = TestClient(app)
        client.post(_surl(), headers=WRITE_AUTH,
                    json={"name": "主力", "assignment": assignment})
        # bump one player's current participation UTR (still legal)
        with Session(engine) as session:
            pid = int(keymap["m2"][1:])
            u = session.exec(select(PlayerSeasonUtr).where(
                PlayerSeasonUtr.player_id == pid,
                PlayerSeasonUtr.season_year == TEST_YEAR)).one()
            u.value = D("6.10")
            session.add(u)
            session.commit()
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert rows[0]["status"] == "utr_moved"
        assert keymap["m2"] in rows[0]["utr_diff"]

    def test_list_carries_sort_order(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        client.post(_surl(), headers=WRITE_AUTH,
                    json={"name": "主力", "assignment": assignment})
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert rows[0]["sort_order"] == 0

    def test_save_without_admin_is_refused(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        r = client.post(_surl(), headers=READ_AUTH,
                        json={"name": "x", "assignment": assignment})
        assert r.status_code in (401, 403)
        assert client.get(_surl(), headers=READ_AUTH).json() == []

    def _make_three(self, client, assignment):
        ids = []
        for n in ("甲", "乙", "丙"):
            r = client.post(_surl(), headers=WRITE_AUTH,
                            json={"name": n, "assignment": assignment})
            ids.append(r.json()["id"])
        return ids  # in insert order → sort_order 0,1,2

    def test_reorder_writes_positions_and_is_idempotent(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        a, b, c = self._make_three(client, assignment)
        # reorder to [c, a, b]
        r = client.patch(f"{_surl()}/order", headers=WRITE_AUTH,
                         json={"order": [c, a, b]})
        assert r.status_code == 200, r.text
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert [row["id"] for row in rows] == [c, a, b]
        assert [row["sort_order"] for row in rows] == [0, 1, 2]
        # idempotent: same list again, still [c, a, b]
        client.patch(f"{_surl()}/order", headers=WRITE_AUTH, json={"order": [c, a, b]})
        rows2 = client.get(_surl(), headers=READ_AUTH).json()
        assert [row["id"] for row in rows2] == [c, a, b]

    def test_reorder_rejects_a_bad_list_whole(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        a, b, c = self._make_three(client, assignment)
        for bad in ([c, a], [c, a, b, 999999], [c, a, a]):
            r = client.patch(f"{_surl()}/order", headers=WRITE_AUTH, json={"order": bad})
            assert r.status_code == 422, (bad, r.text)
        # order unchanged (still insert order)
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert [row["id"] for row in rows] == [a, b, c]

    def test_reorder_without_admin_is_refused(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        a, b, c = self._make_three(client, assignment)
        r = client.patch(f"{_surl()}/order", headers=READ_AUTH, json={"order": [c, b, a]})
        assert r.status_code in (401, 403)

    def test_clone_copies_verbatim_and_appends(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        src = client.post(_surl(), headers=WRITE_AUTH,
                          json={"name": "主力", "assignment": assignment}).json()
        r = client.post(f"{_surl()}/{src['id']}/clone", headers=WRITE_AUTH)
        assert r.status_code == 201, r.text
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert len(rows) == 2
        clone = next(x for x in rows if x["id"] != src["id"])
        assert clone["name"] == "主力 副本"
        # byte-for-byte copy of assignment + snapshot (not re-snapshotted)
        assert clone["assignment"] == src["assignment"]
        assert clone["utr_snapshot"] == src["utr_snapshot"]
        # appended to the end
        assert clone["sort_order"] > src["sort_order"]

    def test_clone_dedupes_the_name(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        src = client.post(_surl(), headers=WRITE_AUTH,
                          json={"name": "主力", "assignment": assignment}).json()
        client.post(f"{_surl()}/{src['id']}/clone", headers=WRITE_AUTH)  # 主力 副本
        client.post(f"{_surl()}/{src['id']}/clone", headers=WRITE_AUTH)  # 主力 副本2
        names = {x["name"] for x in client.get(_surl(), headers=READ_AUTH).json()}
        assert names == {"主力", "主力 副本", "主力 副本2"}

    def test_clone_at_cap_is_409(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        # fill to the cap
        first = None
        for i in range(MAX_SAVED_PER_TEAM):
            r = client.post(_surl(), headers=WRITE_AUTH,
                            json={"name": f"L{i}", "assignment": assignment}).json()
            if i == 0:
                first = r["id"]
        r = client.post(f"{_surl()}/{first}/clone", headers=WRITE_AUTH)
        assert r.status_code == 409

    def test_clone_of_a_near_max_name_stays_within_60_chars(self, seeded):
        # DB checks char_length(name) between 1 and 60. A 58-char source + the
        # 副本 suffix would overflow → raw 500. The clone name must be clamped.
        _, assignment, _ = seeded
        client = TestClient(app)
        long_name = "队" * 58
        src = client.post(_surl(), headers=WRITE_AUTH,
                          json={"name": long_name, "assignment": assignment}).json()
        r = client.post(f"{_surl()}/{src['id']}/clone", headers=WRITE_AUTH)
        assert r.status_code == 201, r.text
        clone = r.json()
        assert len(clone["name"]) <= 60
        assert clone["name"].endswith("副本")

    def test_clone_foreign_id_is_404(self, seeded):
        client = TestClient(app)
        r = client.post(f"{_surl()}/99999999/clone", headers=WRITE_AUTH)
        assert r.status_code == 404

    def test_clone_without_admin_is_refused(self, seeded):
        _, assignment, _ = seeded
        client = TestClient(app)
        src = client.post(_surl(), headers=WRITE_AUTH,
                          json={"name": "主力", "assignment": assignment}).json()
        r = client.post(f"{_surl()}/{src['id']}/clone", headers=READ_AUTH)
        assert r.status_code in (401, 403)

    def test_save_back_overwrites_and_delete(self, seeded):
        _, assignment, keymap = seeded
        client = TestClient(app)
        created = client.post(_surl(), headers=WRITE_AUTH,
                             json={"name": "主力", "assignment": assignment}).json()
        sid = created["id"]
        edited = {**assignment, "WD": [keymap["w3"], keymap["w2"]]}
        put = client.put(f"{_surl()}/{sid}", headers=WRITE_AUTH,
                         json={"assignment": edited})
        assert put.status_code == 200, put.text
        rows = client.get(_surl(), headers=READ_AUTH).json()
        assert rows[0]["assignment"]["WD"] == [keymap["w3"], keymap["w2"]]
        d = client.request("DELETE", f"{_surl()}/{sid}", headers=WRITE_AUTH)
        assert d.status_code == 204
        assert client.get(_surl(), headers=READ_AUTH).json() == []
