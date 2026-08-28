"""Parsing the committee's roster CSV.

Pure functions: CSV text in, records and a report out. No database.

The committee sheet is not a clean roster. It carries merged-cell footnotes
that leaked into data rows, column headers whose dates change every season,
and a rating status that only sometimes determines the rule class. Parsing
has to survive all of that and — this is the part that matters — say what it
could not make sense of instead of quietly dropping it.

All names here are invented.
"""

from decimal import Decimal

import pytest

from app.rosters.parse import parse_roster_csv

HEADER_2025 = (
    "Team,Last Name,First Name,Gender,DUTR Status,Match UTR,"
    "Verified DUTR 09/22,Verified DUTR 09/23,Verified DUTR 09/24,"
    "Verified DUTR 09/25,Verified DUTR 09/26,"
    "Verified SUTR (Reference),SUTR Status (Reference),Notes"
)


def csv_of(*rows: str) -> str:
    return "\n".join([HEADER_2025, *rows]) + "\n"


def only(result):
    """The single parsed entry, asserting there is exactly one."""
    assert len(result.entries) == 1, result.entries
    return result.entries[0]


class TestRatingClass:
    def test_rated_is_verified(self):
        entry = only(
            parse_roster_csv(csv_of("TEST-A,南,望舒,M,Rated,6.50,6.4,6.5,6.5,6.6,6.5,,,"))
        )
        assert entry.rating_class == "verified"

    def test_projected_is_committee(self):
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,东,方朔,M,Projected,5.75,5.7,5.8,5.7,5.8,5.7,,,")
            )
        )
        assert entry.rating_class == "committee"

    def test_unrated_is_left_undetermined(self):
        # Whether an Unrated player is committee-adjudicated or self-rated
        # depends on USTA match history, which the sheet does not carry.
        # Guessing here would silently decide who counts against the
        # "at most 2 self-rated on court" cap.
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,西,门吹雪,M,Unrated,4.00,0,0,0,0,0,,,Captain Provided UTR")
            )
        )
        assert entry.rating_class is None
        assert entry.dutr_status == "Unrated"
        assert entry.source_note == "Captain Provided UTR"

    def test_appeal_suffix_does_not_change_the_class(self):
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,北,冥子,M,Rated / Appeal,7.10,7.1,7.2,7.1,7.0,7.1,,,Appeal Down")
            )
        )
        assert entry.rating_class == "verified"
        # The suffix is evidence of a manual adjustment; it must survive whole.
        assert entry.dutr_status == "Rated / Appeal"

    def test_unrated_with_appeal_is_still_undetermined(self):
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,中,行说,F,Unrated / Appeal,5.00,0,0,0,0,0,,,")
            )
        )
        assert entry.rating_class is None
        assert entry.dutr_status == "Unrated / Appeal"

    def test_projected_with_appeal_is_committee(self):
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,公,孙止,M,Projected / Appeal,6.00,5.9,6.0,6.1,6.0,6.0,,,")
            )
        )
        assert entry.rating_class == "committee"


class TestSourceFields:
    def test_core_fields_round_trip(self):
        entry = only(
            parse_roster_csv(
                csv_of("ZJU-TEST,南,望舒,F,Rated,10.25,10.2,10.3,10.25,10.2,10.3,,,")
            )
        )
        assert entry.team_code == "ZJU-TEST"
        assert (entry.last_name, entry.first_name) == ("南", "望舒")
        assert entry.gender == "F"
        # Exact decimal: a cap comparison at 10.25 is a different answer from
        # one at 10.2.
        assert entry.match_utr == Decimal("10.25")

    def test_daily_values_are_collected_in_column_order(self):
        entry = only(
            parse_roster_csv(
                csv_of("TEST-A,南,望舒,M,Rated,6.50,6.41,6.52,6.53,6.44,6.55,,,")
            )
        )
        assert entry.daily_utrs == [
            Decimal("6.41"),
            Decimal("6.52"),
            Decimal("6.53"),
            Decimal("6.44"),
            Decimal("6.55"),
        ]

    def test_blank_note_is_empty_not_a_placeholder(self):
        entry = only(parse_roster_csv(csv_of("TEST-A,南,望舒,M,Rated,6.50,,,,,,,,")))
        assert entry.source_note is None

    def test_blank_daily_values_are_skipped_not_zeroed(self):
        # A missing sample is absent, not 0.00 — zero is a real UTR value the
        # sheet uses for unrated players.
        entry = only(parse_roster_csv(csv_of("TEST-A,南,望舒,M,Rated,6.50,6.4,,6.5,,,,,")))
        assert entry.daily_utrs == [Decimal("6.4"), Decimal("6.5")]


class TestNonRosterRows:
    @pytest.mark.parametrize(
        "pseudo_team", ["Borrowed Player", "Unrated/Projected/Appeal"]
    )
    def test_pseudo_team_rows_are_skipped_and_reported(self, pseudo_team):
        # These are merged-cell footnotes that leaked into data rows. Treating
        # them as teams would invent two clubs out of a caption.
        result = parse_roster_csv(
            csv_of(
                "TEST-A,南,望舒,M,Rated,6.50,6.4,6.5,6.5,6.6,6.5,,,",
                f"{pseudo_team},说明文字,说明文字,,,,,,,,,,,",
            )
        )

        assert [e.team_code for e in result.entries] == ["TEST-A"]
        assert any(pseudo_team in skipped for skipped in result.skipped_rows)

    def test_unparsable_row_is_reported_with_a_reason(self):
        result = parse_roster_csv(
            csv_of(
                "TEST-A,南,望舒,M,Rated,6.50,6.4,6.5,6.5,6.6,6.5,,,",
                "TEST-A,东,方朔,M,Rated,not-a-number,,,,,,,,",
            )
        )

        assert len(result.entries) == 1
        assert len(result.unparsable_rows) == 1
        row, reason = result.unparsable_rows[0]
        assert "东" in row
        assert reason  # names what went wrong, not just "bad row"

    def test_row_missing_a_required_field_is_reported(self):
        result = parse_roster_csv(csv_of("TEST-A,,望舒,M,Rated,6.50,,,,,,,,"))

        assert result.entries == []
        assert len(result.unparsable_rows) == 1


class TestColumnLayout:
    def test_a_different_sampling_window_still_parses(self):
        # 2026 moves the window to 09/21-09/25. Hardcoding the 2025 header
        # would silently drop every daily value the year the dates shift.
        header_2026 = (
            "Team,Last Name,First Name,Gender,DUTR Status,Match UTR,"
            "Verified DUTR 09/21,Verified DUTR 09/22,Verified DUTR 09/23,"
            "Verified DUTR 09/24,Verified DUTR 09/25,"
            "Verified SUTR (Reference),SUTR Status (Reference),Notes"
        )
        csv_text = (
            header_2026
            + "\nTEST-A,南,望舒,M,Rated,6.50,6.4,6.5,6.5,6.6,6.5,,,\n"
        )

        result = parse_roster_csv(csv_text)
        assert len(result.entries) == 1
        assert len(result.entries[0].daily_utrs) == 5

    def test_unknown_column_is_reported_not_fatal(self):
        csv_text = (
            HEADER_2025
            + ",Mystery Column\nTEST-A,南,望舒,M,Rated,6.50,6.4,6.5,6.5,6.6,6.5,,,,x\n"
        )

        result = parse_roster_csv(csv_text)
        assert len(result.entries) == 1
        assert "Mystery Column" in result.unknown_columns

    def test_missing_required_column_fails_loudly(self):
        # No Match UTR column at all means the file is not what we think it
        # is; importing it would produce a roster with no participation UTRs.
        csv_text = "Team,Last Name,First Name,Gender,DUTR Status\nTEST-A,南,望舒,M,Rated\n"

        with pytest.raises(ValueError) as excinfo:
            parse_roster_csv(csv_text)
        assert "Match UTR" in str(excinfo.value)
