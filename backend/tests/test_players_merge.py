"""Merging, splitting, ruling on a conflict, and freezing a season.

Identity here is a guess made from a name. These four operations are what make
the guess survivable: two records that turn out to be one person get merged,
one record that turns out to be two gets split, a season that ends up with two
candidate numbers gets ruled on, and a season whose matches have been played
gets frozen so none of the above can rewrite it.

The value rule is asymmetric and the tests say so out loud: while a conflict is
unresolved the LARGER candidate is what gets read. Participation UTR is used
almost entirely as an upper bound, so reading low would present an illegal
lineup as legal and only surface on match day.

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
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import (
    Division,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    SeasonLock,
    Team,
)

D = Decimal
TEST_YEAR = 1989  # reserved for this module
OTHER_YEAR = 1988


def _purge(session: Session) -> None:
    for year in (TEST_YEAR, OTHER_YEAR):
        teams = session.exec(select(Team).where(Team.season_year == year)).all()
        for team in teams:
            session.execute(
                delete(PlayerTeamMembership).where(
                    PlayerTeamMembership.team_id == team.id
                )
            )
        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.season_year == year)
        )
        session.commit()
        for team in teams:
            session.delete(team)
        session.commit()
        session.execute(delete(SeasonLock).where(SeasonLock.season_year == year))
        session.execute(delete(Division).where(Division.season_year == year))
        session.execute(delete(Season).where(Season.year == year))
    session.commit()
    for player in session.exec(
        select(Player).where(Player.last_name.in_(["甲", "乙", "丙"]))
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
def db():
    with Session(engine) as session:
        _purge(session)
        for year in (TEST_YEAR, OTHER_YEAR):
            session.add(Season(year=year, edition_name=f"合并测试 {year}"))
        session.commit()
        for year in (TEST_YEAR, OTHER_YEAR):
            for code, name in [("gold", "金组"), ("silver", "银组")]:
                session.add(
                    Division(
                        season_year=year,
                        code=code,
                        display_name=name,
                        scoring_mode="match_count",
                        partner_gap_max=D("3.50"),
                    )
                )
        session.commit()
        for year in (TEST_YEAR, OTHER_YEAR):
            for code, division in [(f"G{year}", "gold"), (f"S{year}", "silver")]:
                session.add(
                    Team(season_year=year, division_code=division, code=code)
                )
        session.commit()

        yield session

        _purge(session)


def team(session: Session, code: str) -> Team:
    return session.exec(select(Team).where(Team.code == code)).one()


def make(
    session: Session,
    first: str,
    *,
    team_code: str | None = None,
    season: int | None = None,
    utr: str | None = None,
    last: str = "甲",
) -> Player:
    player = Player(last_name=last, first_name=first)
    session.add(player)
    session.commit()
    session.refresh(player)

    if team_code:
        session.add(
            PlayerTeamMembership(
                player_id=player.id, team_id=team(session, team_code).id
            )
        )
    if utr is not None:
        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=season or TEST_YEAR,
                value=D(utr),
                status="verified",
                source="committee_sheet",
            )
        )
    session.commit()
    return player


class TestMerge:
    def test_everything_from_both_sides_ends_up_on_one_person(self, db):
        from app.players.command import merge_players

        keep = make(db, "一", team_code=f"G{TEST_YEAR}", utr="6.00")
        drop = make(db, "二", team_code=f"S{TEST_YEAR}", season=OTHER_YEAR, utr="6.10")

        merge_players(db, keep_id=keep.id, merge_id=drop.id)

        memberships = db.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == keep.id
            )
        ).all()
        utrs = db.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == keep.id)
        ).all()

        assert len(memberships) == 2
        assert {u.season_year for u in utrs} == {TEST_YEAR, OTHER_YEAR}
        # The absorbed record is gone, not left behind as a duplicate.
        assert db.get(Player, drop.id) is None

    def test_two_different_values_in_one_season_become_unresolved(self, db):
        from app.players.command import merge_players

        keep = make(db, "一", utr="6.25")
        drop = make(db, "二", utr="6.38")

        merge_players(db, keep_id=keep.id, merge_id=drop.id)

        utr = db.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == keep.id)
        ).one()
        assert utr.is_unresolved is True
        assert utr.value == D("6.38")
        assert utr.alt_value == D("6.25")

    def test_the_same_value_twice_is_not_a_conflict(self, db):
        from app.players.command import merge_players

        keep = make(db, "一", utr="6.38")
        drop = make(db, "二", utr="6.38")

        merge_players(db, keep_id=keep.id, merge_id=drop.id)

        utr = db.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == keep.id)
        ).one()
        assert utr.is_unresolved is False
        assert utr.alt_value is None

    def test_a_conflict_does_not_stop_the_merge(self, db):
        from app.players.command import merge_players

        keep = make(db, "一", team_code=f"G{TEST_YEAR}", utr="6.25")
        drop = make(db, "二", team_code=f"S{TEST_YEAR}", utr="6.38")

        report = merge_players(db, keep_id=keep.id, merge_id=drop.id)

        # Both memberships survive even though the season is now contested:
        # refusing the merge would leave two records for one person, which is
        # the problem the merge exists to fix.
        assert report.memberships_moved == 1
        assert report.conflicts == [TEST_YEAR]

    def test_merging_a_player_into_themselves_is_refused(self, db):
        from app.players.command import Conflict, merge_players

        player = make(db, "一")

        with pytest.raises(Conflict):
            merge_players(db, keep_id=player.id, merge_id=player.id)

    def test_a_membership_both_sides_share_does_not_duplicate(self, db):
        from app.players.command import merge_players

        keep = make(db, "一", team_code=f"G{TEST_YEAR}")
        drop = make(db, "二", team_code=f"G{TEST_YEAR}")

        merge_players(db, keep_id=keep.id, merge_id=drop.id)

        memberships = db.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == keep.id
            )
        ).all()
        assert len(memberships) == 1


class TestSplit:
    def test_the_chosen_rows_move_and_the_rest_stay(self, db):
        from app.players.command import split_player

        player = make(db, "一", team_code=f"G{TEST_YEAR}", utr="6.00")
        db.add(
            PlayerTeamMembership(
                player_id=player.id, team_id=team(db, f"S{TEST_YEAR}").id
            )
        )
        db.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=OTHER_YEAR,
                value=D("6.10"),
                status="verified",
                source="committee_sheet",
            )
        )
        db.commit()

        moving_membership = db.exec(
            select(PlayerTeamMembership)
            .join(Team, Team.id == PlayerTeamMembership.team_id)
            .where(
                PlayerTeamMembership.player_id == player.id,
                Team.code == f"G{TEST_YEAR}",
            )
        ).one()

        new_player = split_player(
            db,
            player_id=player.id,
            last_name="乙",
            first_name="新",
            membership_ids=[moving_membership.id],
            season_years=[OTHER_YEAR],
        )

        moved_teams = db.exec(
            select(Team.code)
            .join(
                PlayerTeamMembership, PlayerTeamMembership.team_id == Team.id
            )
            .where(PlayerTeamMembership.player_id == new_player.id)
        ).all()
        stayed_teams = db.exec(
            select(Team.code)
            .join(
                PlayerTeamMembership, PlayerTeamMembership.team_id == Team.id
            )
            .where(PlayerTeamMembership.player_id == player.id)
        ).all()

        assert moved_teams == [f"G{TEST_YEAR}"]
        assert stayed_teams == [f"S{TEST_YEAR}"]

        moved_years = {
            u.season_year
            for u in db.exec(
                select(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id == new_player.id
                )
            ).all()
        }
        stayed_years = {
            u.season_year
            for u in db.exec(
                select(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id == player.id
                )
            ).all()
        }
        assert moved_years == {OTHER_YEAR}
        assert stayed_years == {TEST_YEAR}

    def test_a_split_creates_a_second_person(self, db):
        from app.players.command import split_player

        player = make(db, "一", team_code=f"G{TEST_YEAR}")

        new_player = split_player(
            db,
            player_id=player.id,
            last_name="乙",
            first_name="新",
            membership_ids=[],
            season_years=[],
        )

        assert new_player.id != player.id
        assert new_player.last_name == "乙"
        # Nothing was selected, so the original keeps everything — an empty
        # split is a no-op on the records, not a silent redistribution.
        assert db.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        ).all()

    def test_a_row_that_belongs_to_someone_else_cannot_be_moved(self, db):
        from app.players.command import NotFound, split_player

        player = make(db, "一")
        other = make(db, "二", team_code=f"G{TEST_YEAR}")
        foreign = db.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == other.id
            )
        ).one()

        with pytest.raises(NotFound):
            split_player(
                db,
                player_id=player.id,
                last_name="丙",
                first_name="新",
                membership_ids=[foreign.id],
                season_years=[],
            )


class TestReadingAnUnresolvedValue:
    def test_the_larger_candidate_is_what_gets_read(self, db):
        from app.players.query import get_player

        player = make(db, "一")
        db.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=D("6.38"),
                alt_value=D("6.25"),
                is_unresolved=True,
                status="verified",
                source="committee_sheet",
            )
        )
        db.commit()

        out = get_player(db, player.id)
        utr = out.season_utrs[0]

        assert utr.value == D("6.38")
        # And it says so: a number that looks settled but is not would be worse
        # than no number at all.
        assert utr.is_unresolved is True
        assert utr.alt_value == D("6.25")


class TestRuling:
    def _contested(self, db) -> Player:
        player = make(db, "一")
        db.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=D("6.38"),
                alt_value=D("6.25"),
                is_unresolved=True,
                status="verified",
                source="committee_sheet",
            )
        )
        db.commit()
        return player

    def test_ruling_settles_the_season_and_records_who_decided(self, db):
        from app.players.command import rule_on_season_utr

        player = self._contested(db)

        row = rule_on_season_utr(db, player.id, TEST_YEAR, value=D("6.25"))

        assert row.value == D("6.25")
        assert row.is_unresolved is False
        assert row.alt_value is None
        # Provenance moves to the ruling: this number is no longer what either
        # sheet said, it is what a human decided.
        assert row.source == "admin_ruling"

    def test_a_third_value_is_allowed(self, db):
        from app.players.command import rule_on_season_utr

        player = self._contested(db)

        # The truth may be neither candidate — the committee can issue a
        # correction after both sheets were frozen.
        row = rule_on_season_utr(db, player.id, TEST_YEAR, value=D("6.30"))

        assert row.value == D("6.30")
        assert row.is_unresolved is False

    def test_ruling_on_a_season_that_is_not_contested_is_refused(self, db):
        from app.players.command import Conflict, rule_on_season_utr

        player = make(db, "一", utr="6.00")

        with pytest.raises(Conflict):
            rule_on_season_utr(db, player.id, TEST_YEAR, value=D("6.10"))


class TestSeasonLock:
    def _lock(self, db, year: int) -> None:
        db.add(SeasonLock(season_year=year))
        db.commit()

    def test_a_locked_season_refuses_a_season_utr_change(self, db):
        from app.players.command import SeasonLocked, set_season_utr

        player = make(db, "一", utr="6.00")
        self._lock(db, TEST_YEAR)

        with pytest.raises(SeasonLocked) as caught:
            set_season_utr(
                db, player.id, TEST_YEAR, value=D("6.50"), source="admin_ruling"
            )

        # The message names the season: told only "forbidden", a caller goes
        # looking for a permissions bug instead of a frozen year.
        assert str(TEST_YEAR) in str(caught.value)

    def test_a_locked_season_refuses_a_membership_change(self, db):
        from app.players.command import SeasonLocked, add_membership

        player = make(db, "一")
        self._lock(db, TEST_YEAR)

        with pytest.raises(SeasonLocked):
            add_membership(db, player.id, team(db, f"G{TEST_YEAR}").id)

    def test_a_locked_season_refuses_a_ruling(self, db):
        from app.players.command import SeasonLocked, rule_on_season_utr

        player = make(db, "一")
        db.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=D("6.38"),
                alt_value=D("6.25"),
                is_unresolved=True,
                status="verified",
                source="committee_sheet",
            )
        )
        db.commit()
        self._lock(db, TEST_YEAR)

        with pytest.raises(SeasonLocked):
            rule_on_season_utr(db, player.id, TEST_YEAR, value=D("6.25"))

    def test_locking_one_season_leaves_the_other_editable(self, db):
        from app.players.command import set_season_utr

        player = make(db, "一")
        db.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=OTHER_YEAR,
                value=D("6.00"),
                status="verified",
                source="committee_sheet",
            )
        )
        db.commit()
        self._lock(db, TEST_YEAR)

        row = set_season_utr(
            db, player.id, OTHER_YEAR, value=D("6.20"), source="admin_ruling"
        )
        assert row.value == D("6.20")

    def test_a_player_with_records_in_a_locked_season_cannot_be_deleted(self, db):
        from app.players.command import SeasonLocked, delete_player

        player = make(db, "一", team_code=f"G{TEST_YEAR}")
        self._lock(db, TEST_YEAR)

        with pytest.raises(SeasonLocked):
            delete_player(db, player.id)

    def test_a_player_with_no_locked_records_can_still_be_deleted(self, db):
        from app.players.command import delete_player

        player = make(db, "一", team_code=f"G{OTHER_YEAR}")
        self._lock(db, TEST_YEAR)

        delete_player(db, player.id)
        assert db.get(Player, player.id) is None

    def test_merging_into_a_locked_season_is_refused(self, db):
        from app.players.command import SeasonLocked, merge_players

        keep = make(db, "一", utr="6.25")
        drop = make(db, "二", utr="6.38")
        self._lock(db, TEST_YEAR)

        # A merge would turn that season's settled value into a contested one,
        # which is a change to a frozen year however it is spelled.
        with pytest.raises(SeasonLocked):
            merge_players(db, keep_id=keep.id, merge_id=drop.id)
