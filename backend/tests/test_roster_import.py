"""The roster importer: CSV in, database rows out, plus a reconciliation
report of what the source could not account for.

Two properties carry the weight:

- Idempotence. Re-import runs whenever a roster changes, so a rewrite-everything
  importer would churn rows on every run.
- Field ownership. Three columns are maintained by hand and absent from the
  CSV. A whole-row rewrite would reset them silently, every time.

All names here are invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import Division, RosterEntry, Season, Team
from app.rosters.load import check_rosters, load_rosters

TEST_YEAR = 1996  # reserved for this module; no real season uses it

HEADER = (
    "Team,Last Name,First Name,Gender,DUTR Status,Match UTR,"
    "Verified DUTR 09/22,Verified DUTR 09/23,Verified DUTR 09/24,Notes"
)

ROWS = [
    "TEST-ALPHA,南,望舒,M,Rated,6.50,6.4,6.5,6.6,",
    "TEST-ALPHA,东,方朔,M,Projected,5.75,5.7,5.8,5.7,Zijing Cup 2024 UTR",
    "TEST-ALPHA,西,门吹雪,F,Unrated,4.00,,,,Captain Provided UTR",
    "TEST-BETA,北,冥子,M,Rated,7.10,7.1,7.2,7.0,",
    "TEST-BETA,中,行说,F,Rated,5.20,5.2,5.1,5.3,",
]


def csv_text(*rows: str) -> str:
    return "\n".join([HEADER, *(rows or ROWS)]) + "\n"


@pytest.fixture
def session():
    with Session(engine) as s:
        _cleanup(s)
        _seed_division(s)
        yield s
        _cleanup(s)


def _cleanup(s: Session) -> None:
    team_ids = [
        t.id for t in s.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    ]
    if team_ids:
        s.execute(delete(RosterEntry).where(RosterEntry.team_id.in_(team_ids)))
        s.execute(delete(Team).where(Team.id.in_(team_ids)))
    s.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    s.execute(delete(Season).where(Season.year == TEST_YEAR))
    s.commit()


def _seed_division(s: Session) -> None:
    s.add(Season(year=TEST_YEAR, edition_name="测试赛季"))
    s.commit()
    s.add(
        Division(
            season_year=TEST_YEAR,
            code="silver",
            display_name="银组",
            scoring_mode="match_count",
            partner_gap_max=Decimal("3.50"),
        )
    )
    s.commit()


def entries_of(s: Session) -> list[RosterEntry]:
    team_ids = [
        t.id for t in s.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    ]
    if not team_ids:
        return []
    return list(
        s.exec(select(RosterEntry).where(RosterEntry.team_id.in_(team_ids))).all()
    )


def by_name(s: Session) -> dict[str, RosterEntry]:
    return {e.first_name: e for e in entries_of(s)}


def load(s: Session, text: str | None = None, **kw):
    return load_rosters(s, text or csv_text(), TEST_YEAR, "silver", **kw)


class TestFirstImport:
    def test_teams_and_entries_land(self, session):
        load(session)
        session.expire_all()

        teams = session.exec(
            select(Team).where(Team.season_year == TEST_YEAR)
        ).all()
        assert {t.code for t in teams} == {"TEST-ALPHA", "TEST-BETA"}
        assert len(entries_of(session)) == 5

    def test_source_fields_are_stored(self, session):
        load(session)
        session.expire_all()

        entry = by_name(session)["方朔"]
        assert entry.match_utr == Decimal("5.75")
        assert entry.dutr_status == "Projected"
        assert entry.source_note == "Zijing Cup 2024 UTR"
        assert entry.daily_utrs == [Decimal("5.7"), Decimal("5.8"), Decimal("5.7")]

    def test_rating_class_is_derived_only_where_determinable(self, session):
        load(session)
        session.expire_all()

        entries = by_name(session)
        assert entries["望舒"].rating_class == "verified"
        assert entries["方朔"].rating_class == "committee"
        # Unrated stays undetermined: the class depends on USTA history the
        # sheet does not carry.
        assert entries["门吹雪"].rating_class is None

    def test_human_owned_fields_start_unset(self, session):
        load(session)
        session.expire_all()

        for entry in entries_of(session):
            assert entry.is_borrowed_player is None
            assert entry.utr_profile_id is None


def snapshot(s: Session) -> set:
    """Primary keys included on purpose.

    Comparing only values would let an importer that deletes and re-inserts
    identical rows on every run look untouched — exactly the churn idempotence
    is supposed to rule out. Identity columns never reuse a number.
    """
    return {
        (e.id, e.team_id, e.last_name, e.first_name, str(e.match_utr))
        for e in entries_of(s)
    }


class TestIdempotence:
    def test_reimport_reports_no_change_and_moves_nothing(self, session):
        load(session)
        session.expire_all()
        before = snapshot(session)

        report = load(session)
        session.expire_all()

        assert report.is_clean
        # Same primary keys: no row was deleted and re-inserted.
        assert snapshot(session) == before

    def test_reimport_does_not_duplicate(self, session):
        load(session)
        load(session)
        session.expire_all()

        assert len(entries_of(session)) == 5
        assert len(session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()) == 2

    def test_changed_value_updates_only_that_row(self, session):
        load(session)
        session.expire_all()
        before = {e.first_name: e.id for e in entries_of(session)}

        edited = [r.replace("6.50", "6.75") if "望舒" in r else r for r in ROWS]
        report = load(session, csv_text(*edited))
        session.expire_all()

        assert not report.is_clean
        entries = by_name(session)
        assert entries["望舒"].match_utr == Decimal("6.75")
        # Every other row keeps its identity.
        for name, entry_id in before.items():
            assert by_name(session)[name].id == entry_id

    def test_row_dropped_from_csv_is_removed(self, session):
        load(session)
        session.expire_all()

        report = load(session, csv_text(*[r for r in ROWS if "行说" not in r]))
        session.expire_all()

        assert report.removed
        assert "行说" not in by_name(session)

    def test_team_disappears_when_its_last_player_does(self, session):
        load(session)
        session.expire_all()

        report = load(session, csv_text(*[r for r in ROWS if not r.startswith("TEST-BETA")]))
        session.expire_all()

        assert report.removed
        teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
        assert {t.code for t in teams} == {"TEST-ALPHA"}


class TestFieldOwnership:
    """The three columns the CSV does not carry must survive re-import.

    Each test below re-imports a CSV that *differs*, so the write path
    actually runs. A re-import of an unchanged CSV writes nothing at all, so
    asserting against it would prove only that a no-op is a no-op — the
    failure mode worth guarding is a real write clobbering a hand-set value.
    """

    def _mark_by_hand(self, session):
        load(session)
        session.expire_all()
        entries = by_name(session)
        entries["望舒"].is_borrowed_player = True
        entries["方朔"].utr_profile_id = "770123"
        entries["门吹雪"].rating_class = "self_rated"
        for e in entries.values():
            session.add(e)
        session.commit()
        session.expire_all()

    def test_borrowed_flag_survives_a_write(self, session):
        self._mark_by_hand(session)

        # Change that same player's UTR so the importer really writes the row.
        edited = [r.replace("6.50", "6.80") if "望舒" in r else r for r in ROWS]
        report = load(session, csv_text(*edited))
        session.expire_all()

        assert not report.is_clean  # the write path ran
        assert by_name(session)["望舒"].is_borrowed_player is True

    def test_profile_id_survives_a_write(self, session):
        self._mark_by_hand(session)

        edited = [r.replace("5.75", "5.85") if "方朔" in r else r for r in ROWS]
        report = load(session, csv_text(*edited))
        session.expire_all()

        assert not report.is_clean
        assert by_name(session)["方朔"].utr_profile_id == "770123"

    def test_hand_filled_rating_class_survives_a_write(self, session):
        # The row is still Unrated in the CSV. The importer must not reset the
        # class a human decided on — not even while updating that same row.
        self._mark_by_hand(session)

        edited = [r.replace("4.00", "4.20") if "门吹雪" in r else r for r in ROWS]
        report = load(session, csv_text(*edited))
        session.expire_all()

        assert not report.is_clean
        assert by_name(session)["门吹雪"].rating_class == "self_rated"

    def test_csv_owned_field_still_updates_alongside(self, session):
        self._mark_by_hand(session)

        edited = [r.replace("6.50", "6.95") if "望舒" in r else r for r in ROWS]
        load(session, csv_text(*edited))
        session.expire_all()

        entry = by_name(session)["望舒"]
        assert entry.match_utr == Decimal("6.95")
        assert entry.is_borrowed_player is True

    def test_check_does_not_report_hand_set_fields_as_drift(self, session):
        self._mark_by_hand(session)

        report = check_rosters(session, csv_text(), TEST_YEAR, "silver")

        assert report.is_clean


class TestCheckMode:
    def test_clean_when_database_matches(self, session):
        load(session)
        assert check_rosters(session, csv_text(), TEST_YEAR, "silver").is_clean

    def test_reports_drift_naming_team_and_player(self, session):
        load(session)
        session.expire_all()

        edited = [r.replace("6.50", "6.75") if "望舒" in r else r for r in ROWS]
        report = check_rosters(session, csv_text(*edited), TEST_YEAR, "silver")

        assert not report.is_clean
        rendered = report.render()
        assert "TEST-ALPHA" in rendered and "望舒" in rendered

    def test_check_writes_nothing(self, session):
        load(session)
        session.expire_all()
        before = snapshot(session)

        edited = [r.replace("6.50", "6.75") if "望舒" in r else r for r in ROWS]
        check_rosters(session, csv_text(*edited), TEST_YEAR, "silver")
        session.expire_all()

        assert snapshot(session) == before

    def test_check_and_load_agree_on_the_difference(self, session):
        load(session)
        session.expire_all()

        edited = [r.replace("5.75", "5.95") if "方朔" in r else r for r in ROWS]
        checked = check_rosters(session, csv_text(*edited), TEST_YEAR, "silver")
        loaded = load(session, csv_text(*edited))

        assert checked.changed == loaded.changed
        assert checked.added == loaded.added
        assert checked.removed == loaded.removed


class TestReconciliation:
    def test_single_row_team_is_flagged_but_still_imported(self, session):
        # The 2025 sheet's silver SJTU had exactly one row, which was really
        # the ranking table's excluded-player note. Import it, but say so.
        report = load(session, csv_text(*ROWS, "TEST-LONE,独,行侠,M,Rated,8.02,8.0,8.1,8.0,"))
        session.expire_all()

        assert any("TEST-LONE" in t for t in report.suspicious_teams)
        assert "行侠" in by_name(session)

    def test_skipped_and_unparsable_rows_reach_the_report(self, session):
        report = load(
            session,
            csv_text(
                *ROWS,
                "Borrowed Player,说明文字,说明文字,,,,,,,",
                "TEST-ALPHA,坏,数据,M,Rated,not-a-number,,,,",
            ),
        )

        assert any("Borrowed Player" in r for r in report.skipped_rows)
        assert len(report.unparsable_rows) == 1

    def test_duplicate_name_on_one_team_aborts_the_import(self, session):
        with pytest.raises(ValueError) as excinfo:
            load(session, csv_text(*ROWS, "TEST-ALPHA,南,望舒,M,Rated,9.00,,,,"))

        assert "望舒" in str(excinfo.value)
        # Nothing from this batch was written.
        assert entries_of(session) == []

    def test_unknown_division_is_refused(self, session):
        with pytest.raises(ValueError) as excinfo:
            load_rosters(session, csv_text(), TEST_YEAR, "bronze")
        assert "bronze" in str(excinfo.value)


# The ranking/seeding tab of the committee sheet. Its layout is two tables
# side by side with a blank spacer column, and team names sit under headers
# that merely contain the word "Team".
RANKING_CSV = "\n".join(
    [
        "TPI Rank,Silver Team,TPI as of Thu,Notes,,Seed Rank,Silver Team,TPI,Notes",
        "1,TEST-ALPHA,62.6,,,1,TEST-ALPHA,62.6,#1 Seed",
        "2,TEST-BETA,61.4,,,2,TEST-GHOST,59.9,",
        "3,TEST-GHOST,59.9,,,3,TEST-BETA,61.4,",
    ]
) + "\n"


class TestRankingReconciliation:
    """The sheet does not agree with itself across tabs.

    In 2025, five silver teams were seeded with no roster and two were
    rostered without appearing in the seeding table. Importing quietly would
    produce a roster that looks complete and is missing five teams — lineup
    analysis against it would look fine and be wrong.
    """

    def test_team_ranked_but_not_rostered_is_reported(self, session):
        report = load(session, ranking_text=RANKING_CSV)

        assert any("TEST-GHOST" in line for line in report.ranked_without_roster)

    def test_team_rostered_but_not_ranked_is_reported(self, session):
        ranking_without_beta = RANKING_CSV.replace("TEST-BETA", "TEST-OTHER")
        report = load(session, ranking_text=ranking_without_beta)

        assert any("TEST-BETA" in line for line in report.rostered_without_ranking)

    def test_matching_teams_are_not_reported(self, session):
        exact = "\n".join(
            ["TPI Rank,Silver Team,TPI", "1,TEST-ALPHA,62.6", "2,TEST-BETA,61.4"]
        ) + "\n"
        report = load(session, ranking_text=exact)

        assert report.ranked_without_roster == []
        assert report.rostered_without_ranking == []

    def test_reconciliation_appears_in_the_rendered_report(self, session):
        # The CLI prints render(). Populating the lists without rendering them
        # would make the whole reconciliation invisible to whoever runs the
        # import — which is the one person it exists for.
        report = load(session, ranking_text=RANKING_CSV)
        rendered = report.render()

        assert "TEST-GHOST" in rendered
        assert "有排名无名单" in rendered

    def test_without_a_ranking_csv_those_sections_are_absent(self, session):
        report = load(session)

        assert report.ranked_without_roster == []
        assert report.rostered_without_ranking == []
        assert "有排名无名单" not in report.render()

    def test_ranking_values_are_never_stored(self, session):
        load(session, ranking_text=RANKING_CSV)
        session.expire_all()

        # TEST-GHOST is ranked but has no roster rows; it must not become a team.
        teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
        assert {t.code for t in teams} == {"TEST-ALPHA", "TEST-BETA"}

    def test_check_mode_also_reconciles(self, session):
        load(session)
        report = check_rosters(
            session, csv_text(), TEST_YEAR, "silver", RANKING_CSV
        )

        # Nothing to write, but the source still does not add up.
        assert report.is_clean
        assert any("TEST-GHOST" in line for line in report.ranked_without_roster)
