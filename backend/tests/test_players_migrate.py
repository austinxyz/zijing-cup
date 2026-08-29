"""Reading the roster snapshot into the player registry.

The rules that decide *who is one person* are pure functions here, tested
against hand-built rows rather than whatever the database happens to hold —
same reason `app/lineups/rules.py` is pure. Identity is a guess, and a guess
deserves dense tests.

The database half (the command itself) gets its own class further down.

All names are invented except where a real 2025 shape is being reproduced.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest

D = Decimal


def row(
    last: str,
    first: str,
    season: int = 2025,
    division: str = "silver",
    team: str = "TEAM-A",
    utr: str = "6.00",
    gender: str | None = "M",
    status: str = "Rated",
    rating_class: str | None = "verified",
    profile: str | None = None,
):
    """One `roster_entries` row as the migration sees it."""
    from app.players.merge_rules import SourceRow

    return SourceRow(
        last_name=last,
        first_name=first,
        season_year=season,
        division_code=division,
        team_code=team,
        match_utr=D(utr),
        gender=gender,
        dutr_status=status,
        rating_class=rating_class,
        utr_profile_id=profile,
    )


class TestIdentityKey:
    def test_case_and_padding_do_not_make_two_people(self):
        from app.players.merge_rules import identity_key

        assert identity_key(" Zhou ", "Mike") == identity_key("zhou", "MIKE")

    def test_different_names_stay_different(self):
        from app.players.merge_rules import identity_key

        assert identity_key("Li", "Shen") != identity_key("Li", "Sheng")

    def test_an_alias_in_quotes_is_left_alone(self):
        from app.players.merge_rules import identity_key

        # A real 2025 row: Xie Yuntao "Young". Stripping the quoted part would
        # merge him with a different Xie Yuntao if one existed, and there is no
        # evidence either way — so the whole string stays part of the key.
        a = identity_key("Xie", 'Yuntao "Young"')
        b = identity_key("Xie", "Yuntao")
        assert a != b

    def test_the_two_halves_do_not_bleed_into_each_other(self):
        from app.players.merge_rules import identity_key

        # "Li" + "Shen" and "Lis" + "hen" must not collide: a naive
        # concatenation would make them the same person.
        assert identity_key("Li", "Shen") != identity_key("Lis", "hen")


class TestGrouping:
    def test_rows_with_the_same_name_become_one_player(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("Zhou", "Mike", division="gold", team="THU-UOC"),
            row("Zhou", "Mike", division="silver", team="THU-I"),
        ])

        assert len(people) == 1
        assert len(people[0].memberships) == 2

    def test_two_seasons_are_two_season_utrs_not_two_people(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("Ye", "Ming", season=2025, utr="6.72"),
            row("Ye", "Ming", season=2026, utr="6.90"),
        ])

        assert len(people) == 1
        assert {u.season_year for u in people[0].season_utrs} == {2025, 2026}

    def test_the_order_of_the_input_does_not_change_the_output(self):
        from app.players.merge_rules import group_rows

        rows = [
            row("Ye", "Ming", team="A"),
            row("Li", "Shen", team="B"),
            row("Ye", "Ming", season=2026, team="C"),
        ]
        forward = [p.identity for p in group_rows(rows)]
        backward = [p.identity for p in group_rows(list(reversed(rows)))]

        # Same roster, same answer: a migration whose output depends on row
        # order would produce different player IDs on a re-run.
        assert forward == backward


class TestConflict:
    def test_two_different_values_in_one_season_are_unresolved(self):
        from app.players.merge_rules import group_rows

        # The real shape: gold sheet 6.25, silver sheet 6.38, frozen days apart.
        people = group_rows([
            row("Zong", "Qingqing", division="gold", team="THU-UOC", utr="6.25"),
            row("Zong", "Qingqing", division="silver", team="THU-I", utr="6.38"),
        ])
        utr = people[0].season_utrs[0]

        assert utr.is_unresolved is True
        # Larger in `value`: participation UTR is an upper bound, so reading low
        # would call an illegal lineup legal.
        assert utr.value == D("6.38")
        assert utr.alt_value == D("6.25")

    def test_the_same_value_twice_is_not_a_conflict(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("Cai", "Ying", division="gold", team="HUST-NTU", utr="7.24"),
            row("Cai", "Ying", division="silver", team="HUST", utr="7.24"),
        ])
        utr = people[0].season_utrs[0]

        assert utr.is_unresolved is False
        assert utr.alt_value is None
        assert utr.value == D("7.24")

    def test_a_conflict_in_one_season_leaves_the_other_alone(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("Zong", "Qingqing", season=2025, division="gold", utr="6.25"),
            row("Zong", "Qingqing", season=2025, division="silver", utr="6.38"),
            row("Zong", "Qingqing", season=2026, division="silver", utr="6.50"),
        ])
        by_season = {u.season_year: u for u in people[0].season_utrs}

        assert by_season[2025].is_unresolved is True
        assert by_season[2026].is_unresolved is False

    def test_three_different_values_keep_the_largest_and_flag_it(self):
        from app.players.merge_rules import group_rows

        # Not reachable from two divisions today, but the model must not lose
        # its footing if a season ever carries more than two sheets.
        people = group_rows([
            row("A", "B", team="T1", utr="6.10"),
            row("A", "B", team="T2", utr="6.30"),
            row("A", "B", team="T3", utr="6.20"),
        ])
        utr = people[0].season_utrs[0]

        assert utr.value == D("6.30")
        assert utr.is_unresolved is True
        assert utr.alt_value is not None and utr.alt_value < utr.value


class TestFieldMapping:
    def test_the_sheet_status_becomes_a_committee_status(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("A", "B", status="Rated", rating_class="verified"),
            row("C", "D", status="Projected", rating_class="committee"),
        ])
        got = {p.identity: p.season_utrs[0].status for p in people}

        assert sorted(got.values()) == ["committee", "verified"]

    def test_an_unrated_row_migrates_with_no_status_at_all(self):
        from app.players.merge_rules import group_rows

        # 33 of the 459 real rows are Unrated with a blank rating class.
        # Whether such a player is committee-adjudicated or captain-rated
        # depends on USTA match history the sheet does not carry, so the
        # migration MUST NOT pick one — the same reason team-roster leaves
        # `rating_class` null and the roster page shows 待定 rather than 自评.
        people = group_rows([row("E", "F", status="Unrated", rating_class=None)])
        utr = people[0].season_utrs[0]

        assert utr.status is None

    def test_the_appeal_suffix_becomes_a_flag_not_a_status(self):
        from app.players.merge_rules import group_rows

        people = group_rows([
            row("A", "B", status="Rated / Appeal", rating_class="verified")
        ])
        utr = people[0].season_utrs[0]

        assert utr.under_appeal is True
        assert utr.status == "verified"

    def test_everything_migrated_came_from_the_committee_sheet(self):
        from app.players.merge_rules import group_rows

        people = group_rows([row("A", "B")])
        # Not 'prefilled': these are frozen official numbers, and calling them a
        # guess would be as wrong as calling a guess official.
        assert people[0].season_utrs[0].source == "committee_sheet"

    def test_the_hand_maintained_columns_ride_along(self):
        from app.players.merge_rules import group_rows

        people = group_rows([row("A", "B", profile="880077", gender="F")])

        assert people[0].utr_profile_id == "880077"
        assert people[0].gender == "F"


class TestMigrationCommand:
    """The database half. Builds a throwaway season, runs the command, checks
    what landed."""

    @pytest.fixture()
    def snapshot(self):
        from tests.helpers_players import build_snapshot

        with build_snapshot() as ctx:
            yield ctx

    def test_every_source_row_gets_a_membership(self, snapshot):
        from app.players.migrate import migrate_rosters

        report = migrate_rosters(snapshot.session, seasons=[snapshot.year])

        assert report.players_created == snapshot.expected_players
        assert report.memberships_created == snapshot.row_count

    def test_a_cross_division_conflict_is_flagged_not_decided(self, snapshot):
        from app.models import Player, PlayerSeasonUtr
        from app.players.migrate import migrate_rosters
        from sqlmodel import select

        migrate_rosters(snapshot.session, seasons=[snapshot.year])

        player = snapshot.session.exec(
            select(Player).where(Player.first_name == "Qingqing")
        ).one()
        utr = snapshot.session.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        ).one()

        assert utr.is_unresolved is True
        assert utr.value == D("6.38")
        assert utr.alt_value == D("6.25")

    def test_running_it_twice_changes_nothing(self, snapshot):
        from app.players.migrate import migrate_rosters

        first = migrate_rosters(snapshot.session, seasons=[snapshot.year])
        second = migrate_rosters(snapshot.session, seasons=[snapshot.year])

        assert first.players_created == snapshot.expected_players
        assert second.players_created == 0
        assert second.memberships_created == 0
        assert second.season_utrs_created == 0
        assert snapshot.count_players() == snapshot.expected_players

    def test_check_mode_writes_nothing(self, snapshot):
        from app.players.migrate import migrate_rosters

        report = migrate_rosters(
            snapshot.session, seasons=[snapshot.year], check_only=True
        )

        assert report.players_created > 0  # what it WOULD create
        assert snapshot.count_players() == 0
