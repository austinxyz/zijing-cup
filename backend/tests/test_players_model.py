"""Schema-level tests for the player registry tables.

Like test_roster_model.py these talk to the real local Postgres, because the
thing under test IS the schema: the uniqueness constraints here are what stop
a conflict from spreading, and only the database knows what it actually
enforces.

Three tables, and the shape of each one is a decision:

- `players` is a person across seasons, independent of any team.
- `player_season_utrs` is one row per (player, season) — never two. An
  unresolved conflict lives inside that single row as a second value, because
  two rows would break the uniqueness the rest of the model leans on.
- `player_team_memberships` is many rows per player: the rules let one person
  play gold and silver in the same season.

All names are invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select, text

from app.db import SCHEMA, engine
from app.models import Division, Season, Team

PLAYER_TABLES = {"players", "player_season_utrs", "player_team_memberships"}
TEST_YEAR = 1993  # reserved for this module


@pytest.fixture(scope="module")
def session():
    with Session(engine) as s:
        yield s


@pytest.fixture(scope="module", autouse=True)
def season(session):
    """The reserved season these rows hang off.

    A season UTR references `seasons`, so the row has to exist — the foreign
    key is the point: a participation value for a season that was never held
    is not a value, it is a typo.
    """
    session.add(Season(year=TEST_YEAR, edition_name="模型测试赛季"))
    session.commit()

    yield TEST_YEAR

    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()


def _tables_in(session: Session, schema: str) -> set[str]:
    rows = session.execute(
        text(
            "select table_name from information_schema.tables "
            "where table_schema = :schema"
        ),
        {"schema": schema},
    )
    return {row[0] for row in rows}


def _columns(session: Session, table: str) -> dict[str, str]:
    rows = session.execute(
        text(
            "select column_name, is_nullable from information_schema.columns "
            "where table_schema = :schema and table_name = :table"
        ),
        {"schema": SCHEMA, "table": table},
    )
    return {row[0]: row[1] for row in rows}


class TestSchemaPlacement:
    def test_the_three_tables_live_in_the_project_schema(self, session):
        # Not public: this Supabase project is shared with another app, and a
        # table in public would be that app's namespace.
        assert PLAYER_TABLES <= _tables_in(session, SCHEMA)

    def test_nothing_was_added_to_public(self, session):
        assert not (PLAYER_TABLES & _tables_in(session, "public"))


class TestPlayer:
    def test_a_player_needs_no_team(self, session):
        from app.models import Player

        player = Player(last_name="南", first_name="望舒", gender="F")
        session.add(player)
        session.commit()
        session.refresh(player)

        assert player.id is not None
        # No membership, no season UTR — and that is a complete, valid player.
        session.delete(player)
        session.commit()

    def test_the_two_current_utrs_carry_their_own_status(self, session):
        from app.models import Player

        player = Player(
            last_name="西",
            first_name="门吹雪",
            gender="M",
            singles_utr=Decimal("7.23"),
            singles_status="projected",
            doubles_utr=Decimal("6.72"),
            doubles_status="rated",
            utr_profile_id="4713142",
        )
        session.add(player)
        session.commit()
        session.refresh(player)

        assert player.singles_status == "projected"
        assert player.doubles_status == "rated"
        # Decimal end to end: 10.25 and 10.2 are different answers at a cap.
        assert player.singles_utr == Decimal("7.23")

        session.delete(player)
        session.commit()

    def test_a_player_with_neither_utr_is_allowed(self, session):
        from app.models import Player

        # A brand new person the captain has only just heard of. Both UTRs
        # unknown is a real state, not missing data to be defaulted away.
        player = Player(last_name="北", first_name="冥子", gender=None)
        session.add(player)
        session.commit()
        session.refresh(player)

        assert player.singles_utr is None
        assert player.doubles_utr is None
        assert player.gender is None

        session.delete(player)
        session.commit()


class TestSeasonUtr:
    def test_one_row_per_player_and_season(self, session):
        from app.models import Player, PlayerSeasonUtr

        player = Player(last_name="东", first_name="方朔")
        session.add(player)
        session.commit()
        session.refresh(player)

        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=Decimal("6.38"),
                status="verified",
                source="committee_sheet",
            )
        )
        session.commit()

        # A second row for the same (player, season) is what would let a
        # conflict spread: every reader downstream would have to decide which
        # row it meant. The database refuses instead.
        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=Decimal("6.25"),
                status="verified",
                source="committee_sheet",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        )
        session.delete(player)
        session.commit()

    def test_a_conflict_lives_in_one_row_as_a_second_value(self, session):
        from app.models import Player, PlayerSeasonUtr

        player = Player(last_name="南", first_name="宫适")
        session.add(player)
        session.commit()
        session.refresh(player)

        # The unresolved case: gold sheet said 6.25, silver said 6.38. Both
        # kept, larger one in `value` because that is what gets read.
        row = PlayerSeasonUtr(
            player_id=player.id,
            season_year=TEST_YEAR,
            value=Decimal("6.38"),
            alt_value=Decimal("6.25"),
            is_unresolved=True,
            status="verified",
            source="committee_sheet",
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        assert row.value == Decimal("6.38")
        assert row.alt_value == Decimal("6.25")
        assert row.is_unresolved is True

        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        )
        session.delete(player)
        session.commit()

    def test_appeal_rides_on_top_of_a_status_rather_than_replacing_it(self, session):
        from app.models import Player, PlayerSeasonUtr

        player = Player(last_name="上", first_name="官婉")
        session.add(player)
        session.commit()
        session.refresh(player)

        # Real 2025 data has Rated / Appeal, Projected / Appeal AND
        # Unrated / Appeal — so Appeal cannot be a fourth status.
        row = PlayerSeasonUtr(
            player_id=player.id,
            season_year=TEST_YEAR,
            value=Decimal("5.00"),
            status="committee",
            under_appeal=True,
            source="prefilled",
        )
        session.add(row)
        session.commit()
        session.refresh(row)

        assert row.status == "committee"
        assert row.under_appeal is True

        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        )
        session.delete(player)
        session.commit()

    @pytest.mark.parametrize(
        "source", ["prefilled", "committee_sheet", "admin_ruling"]
    )
    def test_every_provenance_value_is_storable(self, session, source):
        from app.models import Player, PlayerSeasonUtr

        player = Player(last_name="司", first_name=f"马{source}")
        session.add(player)
        session.commit()
        session.refresh(player)

        row = PlayerSeasonUtr(
            player_id=player.id,
            season_year=TEST_YEAR,
            value=Decimal("5.50"),
            status="captain",
            source=source,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        assert row.source == source

        session.execute(
            delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        )
        session.delete(player)
        session.commit()

    def test_an_unknown_provenance_is_rejected(self, session):
        from app.models import Player, PlayerSeasonUtr

        player = Player(last_name="欧", first_name="阳修")
        session.add(player)
        session.commit()
        session.refresh(player)

        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=TEST_YEAR,
                value=Decimal("5.50"),
                status="verified",
                source="guessed",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.delete(player)
        session.commit()


class TestMembership:
    @pytest.fixture(scope="class")
    def teams(self, session):
        made = []
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
            team = Team(season_year=TEST_YEAR, division_code=code, code=f"MODEL-{code}")
            session.add(team)
            session.commit()
            session.refresh(team)
            made.append(team)

        yield made

        for team in made:
            session.delete(team)
        session.commit()
        session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
        session.commit()

    def test_one_player_can_belong_to_both_divisions_of_a_season(self, session, teams):
        from app.models import Player, PlayerTeamMembership

        player = Player(last_name="诸", first_name="葛亮")
        session.add(player)
        session.commit()
        session.refresh(player)

        for team in teams:
            session.add(
                PlayerTeamMembership(
                    player_id=player.id,
                    team_id=team.id,
                    representing_school="清华",
                    is_borrowed_player=False,
                    is_wildcard=False,
                )
            )
        session.commit()

        rows = session.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        ).all()
        assert len(rows) == 2

        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        )
        session.delete(player)
        session.commit()

    def test_the_same_player_cannot_join_one_team_twice(self, session, teams):
        from app.models import Player, PlayerTeamMembership

        player = Player(last_name="周", first_name="公瑾")
        session.add(player)
        session.commit()
        session.refresh(player)

        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=teams[0].id)
        )
        session.commit()
        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=teams[0].id)
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        )
        session.delete(player)
        session.commit()

    def test_representing_school_is_free_text_and_optional(self, session, teams):
        from app.models import Player, PlayerTeamMembership

        player = Player(last_name="黄", first_name="承彦")
        session.add(player)
        session.commit()
        session.refresh(player)

        # No school table to join against: the team code itself is a hand
        # written string like ZJU-USC that the sheet spells differently across
        # tabs, so any lookup table would inherit that alias problem.
        session.add(
            PlayerTeamMembership(
                player_id=player.id,
                team_id=teams[0].id,
                representing_school="加州大学圣地亚哥分校（UCSD）",
            )
        )
        session.commit()

        row = session.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        ).one()
        assert row.representing_school == "加州大学圣地亚哥分校（UCSD）"
        # Nobody has said yet whether this person is borrowed or a wildcard;
        # null is "unmarked", which is not the same claim as "no".
        assert row.is_borrowed_player is None
        assert row.is_wildcard is None

        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        )
        session.delete(player)
        session.commit()


class TestTheTwoStatusVocabulariesAreSeparate:
    def test_current_utr_status_and_season_utr_status_are_different_sets(self):
        from app.models import CURRENT_UTR_STATUSES, SEASON_UTR_STATUSES

        # The first is UTR's own rating state; the second is how the committee
        # decided the participation value. "captain" has no counterpart on the
        # UTR site, so the two vocabularies cannot be folded into one.
        assert CURRENT_UTR_STATUSES == {"unrated", "projected", "rated"}
        assert SEASON_UTR_STATUSES == {"verified", "committee", "captain"}
        assert "captain" not in CURRENT_UTR_STATUSES

    def test_the_database_enforces_each_vocabulary(self, session):
        from app.models import Player

        player = Player(
            last_name="张",
            first_name="仲景",
            singles_status="verified",  # a season-UTR word, not a current one
        )
        session.add(player)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


class TestSeasonLock:
    def test_locking_a_season_without_naming_a_time_records_one(self, session):
        from app.models import SeasonLock

        # The migration declares `locked_at timestamptz not null default now()`,
        # so the row is meant to timestamp itself. A model that sends an
        # explicit NULL instead turns "lock this season" into an
        # IntegrityError — the whole freeze mechanism would be unreachable.
        lock = SeasonLock(season_year=TEST_YEAR)
        session.add(lock)
        session.commit()
        session.refresh(lock)

        assert lock.locked_at is not None

        session.delete(lock)
        session.commit()
