"""The current-UTR round-trip sheet: parsing and diffing.

Pure functions only — no session, no database. The sheet leaves this system
carrying each player's own id and comes back with it untouched, so nothing
here ever decides "which player is this row about". That judgement is the one
thing the design refuses to make: a wrong guess here puts a perfectly
plausible number on the wrong person, and nothing on any page would look
amiss.

All names are invented.
"""

from __future__ import annotations

from decimal import Decimal

from app.players.utr_sheet import (
    PlayerView,
    SheetRow,
    diff_sheet,
    parse_sheet,
)

HEADER = "id\t姓\t名\t当前单打\t单打状态\t当前双打\t双打状态\tUTR链接"


def test_parses_a_pasted_block_into_rows() -> None:
    text = "\n".join(
        [
            HEADER,
            "1042\t南\t望舒\t6.90\trated\t6.72\tprojected\t880077",
        ]
    )

    rows = parse_sheet(text)

    assert rows == [
        SheetRow(
            line_number=2,
            player_id=1042,
            last_name="南",
            first_name="望舒",
            singles_utr="6.90",
            singles_status="rated",
            doubles_utr="6.72",
            doubles_status="projected",
            utr_link="880077",
        )
    ]


def test_a_csv_upload_parses_to_exactly_what_a_paste_would() -> None:
    # Two entry points, one parser. Different results would leave the reader
    # with no way to tell which one to believe.
    tsv = "\n".join([HEADER, "1042\t南\t望舒\t6.90\trated\t\t\t"])
    csv = "\n".join(
        [HEADER.replace("\t", ","), "1042,南,望舒,6.90,rated,,,"]
    )

    assert parse_sheet(csv) == parse_sheet(tsv)


def player(
    player_id: int = 1042,
    last_name: str = "南",
    first_name: str = "望舒",
    **current: object,
) -> PlayerView:
    """A player as the database has them, for the diff to compare against."""
    return PlayerView(
        player_id=player_id,
        last_name=last_name,
        first_name=first_name,
        singles_utr=current.get("singles_utr"),
        singles_status=current.get("singles_status"),
        doubles_utr=current.get("doubles_utr"),
        doubles_status=current.get("doubles_status"),
        utr_profile_id=current.get("utr_profile_id"),
    )


def sheet(*body: str) -> str:
    return "\n".join([HEADER, *body])


def test_exporting_and_importing_untouched_changes_nothing() -> None:
    # The floor the whole round trip stands on: the trip itself is inert, so
    # every difference that shows up came from what the person typed.
    people = [player(singles_utr=Decimal("6.90"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t6.90\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.errors == []
    assert result.changes == []


def test_a_blank_cell_leaves_the_value_alone() -> None:
    # The common use is filling in a handful of people. Reading blank as
    # "clear it" would wipe a whole squad on the first import.
    people = [player(singles_utr=Decimal("6.90"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t\t\t6.40\trated\t")

    result = diff_sheet(parse_sheet(text), people)

    changed = {f.field for f in result.changes[0].fields}
    assert changed == {"doubles_utr", "doubles_status"}


def test_a_dash_clears_the_value_and_counts_as_a_change() -> None:
    # Without an explicit way to clear, a value typed in by mistake can never
    # go back to "none".
    people = [player(singles_utr=Decimal("6.90"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t-\t-\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    fields = {f.field: f for f in result.changes[0].fields}
    assert fields["singles_utr"].old == "6.90"
    assert fields["singles_utr"].new is None


def test_a_value_without_its_status_is_rejected() -> None:
    # A number with no status is one the derivation chain will not use, but
    # the roster page shows it all the same — the reader would take it as
    # usable.
    text = sheet("1042\t南\t望舒\t\t\t6.40\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1
    assert "状态" in result.errors[0].message


def test_a_status_without_its_value_is_rejected_too() -> None:
    text = sheet("1042\t南\t望舒\t\t\t\trated\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1


def test_the_status_column_is_case_insensitive() -> None:
    # The site writes "Rated"; a person copying it by hand may write "rated".
    text = sheet("1042\t南\t望舒\t6.90\tRated\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.errors == []
    fields = {f.field: f for f in result.changes[0].fields}
    assert fields["singles_status"].new == "rated"


def test_a_word_from_the_other_vocabulary_is_rejected() -> None:
    # `verified` belongs to the committee's vocabulary for participation
    # UTRs. The two look alike and mean different things, so neither is
    # allowed to stand in for the other.
    text = sheet("1042\t南\t望舒\t6.90\tverified\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1
    assert "rated" in result.errors[0].message


def test_a_chinese_label_is_rejected_rather_than_translated() -> None:
    text = sheet("1042\t南\t望舒\t6.90\t已认证\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1


def test_an_id_the_database_does_not_have_is_an_error() -> None:
    text = sheet("9999\t南\t望舒\t6.90\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1
    assert "9999" in result.errors[0].message


def test_a_name_that_does_not_match_the_id_stops_the_row() -> None:
    # The one way a round trip breaks: rows reordered, or a paste landing a
    # line off. The id and the name come apart together, and the check sees it.
    people = [player(player_id=1058, last_name="谢", first_name="行简")]
    text = sheet("1058\t毛\t尼尔\t6.90\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.changes == []
    assert len(result.errors) == 1
    message = result.errors[0].message
    assert "谢" in message and "毛" in message


def test_a_missing_id_is_never_resolved_by_name() -> None:
    # Even when the name matches exactly one person in the database. Falling
    # back here would withdraw the design's one guarantee at precisely the
    # moment it is needed: a wrong current UTR is invisible on every screen.
    people = [player(player_id=1042, last_name="南", first_name="望舒")]
    text = sheet("\t南\t望舒\t6.90\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.changes == []
    assert len(result.errors) == 1


def test_a_bare_profile_id_is_stored_as_is() -> None:
    text = sheet("1042\t南\t望舒\t\t\t\t\t880077")

    result = diff_sheet(parse_sheet(text), [player()])

    fields = {f.field: f for f in result.changes[0].fields}
    assert fields["utr_profile_id"].new == "880077"


def test_a_full_profile_link_yields_the_same_id() -> None:
    # Whichever the person pastes, the database ends up holding one thing.
    text = sheet(
        "1042\t南\t望舒\t\t\t\t\thttps://app.utrsports.net/profiles/880077"
    )

    result = diff_sheet(parse_sheet(text), [player()])

    fields = {f.field: f for f in result.changes[0].fields}
    assert fields["utr_profile_id"].new == "880077"


def test_something_with_no_id_in_it_is_rejected_not_stored_raw() -> None:
    # Storing the raw text would leave a column that is half ids and half
    # prose, and nothing downstream could tell which it was holding.
    text = sheet("1042\t南\t望舒\t\t\t\t\t见微信群")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1


def test_counts_changes_per_field() -> None:
    # The signal a per-person layout throws away: a whole column pasted one
    # place over shows up as an implausibly high count for that one field.
    people = [player(player_id=1), player(player_id=2), player(player_id=3)]
    text = sheet(
        "1\t南\t望舒\t6.90\trated\t\t\t",
        "2\t南\t望舒\t6.10\trated\t\t\t",
        "3\t南\t望舒\t\t\t6.40\trated\t",
    )

    result = diff_sheet(parse_sheet(text), people)

    assert result.counts["singles_utr"] == 2
    assert result.counts["doubles_utr"] == 1
    assert result.counts["utr_profile_id"] == 0


def test_reports_who_the_sheet_left_out() -> None:
    # Filling in a handful of people is a normal use, so a short sheet is not
    # an error — but saying nothing would let it read as the whole squad.
    people = [player(player_id=n) for n in (1, 2, 3, 4, 5)]
    text = sheet("1\t南\t望舒\t6.90\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.covered == 1
    assert result.not_covered == 4


def test_the_same_number_written_differently_is_not_a_change() -> None:
    # The database holds Decimal("7.00"); a person types 7. Comparing the two
    # as text calls that a change, which would fill the confirmation screen
    # with edits nobody made — and the round trip is supposed to be inert.
    people = [player(singles_utr=Decimal("7.00"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t7\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.errors == []
    assert result.changes == []


def test_a_real_numeric_change_is_still_caught() -> None:
    people = [player(singles_utr=Decimal("7.00"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t7.10\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert [f.field for f in result.changes[0].fields] == ["singles_utr"]


def test_a_utr_that_is_not_a_number_is_rejected() -> None:
    text = sheet("1042\t南\t望舒\t约 6.9\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1


def test_clearing_one_half_of_a_pair_is_rejected() -> None:
    # Clearing the value while setting the status leaves exactly the state the
    # pairing rule exists to prevent: a status with no number under it.
    text = sheet("1042\t南\t望舒\t-\trated\t\t\t")

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1


def test_clearing_both_halves_together_is_fine() -> None:
    people = [player(singles_utr=Decimal("6.90"), singles_status="rated")]
    text = sheet("1042\t南\t望舒\t-\t-\t\t\t")

    result = diff_sheet(parse_sheet(text), people)

    assert result.errors == []
    assert {f.field for f in result.changes[0].fields} == {
        "singles_utr",
        "singles_status",
    }


def test_the_same_player_twice_is_an_error_not_a_silent_overwrite() -> None:
    # Easy to produce by copy-pasting in a spreadsheet. Letting the last row
    # win would quietly discard one of two numbers the person typed, with
    # nothing to say which.
    text = sheet(
        "1042\t南\t望舒\t6.90\trated\t\t\t",
        "1042\t南\t望舒\t7.10\trated\t\t\t",
    )

    result = diff_sheet(parse_sheet(text), [player()])

    assert result.changes == []
    assert len(result.errors) == 1
    assert "1042" in result.errors[0].message


def test_a_csv_cell_may_contain_a_comma() -> None:
    # Real names and notes contain commas; a spreadsheet quotes them. Splitting
    # on every comma shifts the whole row one column over.
    csv = "\n".join(
        [
            HEADER.replace("\t", ","),
            '1042,南,"望舒, Jr.",6.90,rated,,,',
        ]
    )

    rows = parse_sheet(csv)

    assert rows[0].first_name == "望舒, Jr."
    assert rows[0].singles_utr == "6.90"


def test_the_profile_id_comes_from_the_profile_path_not_the_last_number() -> None:
    # A link can carry a tracking parameter; taking the last run of digits
    # would store that instead of the profile.
    text = sheet(
        "1042\t南\t望舒\t\t\t\t\t"
        "https://app.utrsports.net/profiles/880077?t=12345"
    )

    result = diff_sheet(parse_sheet(text), [player()])

    fields = {f.field: f for f in result.changes[0].fields}
    assert fields["utr_profile_id"].new == "880077"


def test_a_sheet_with_any_error_produces_no_changes_at_all() -> None:
    # The mistake this feature invites is a whole column pasted one place
    # over, and then nearly every row is wrong. Writing the good half would
    # leave the database half new and half old, with nothing recording which
    # half is which.
    people = [player(player_id=1), player(player_id=2)]
    text = sheet(
        "1\t南\t望舒\t6.90\trated\t\t\t",
        "2\t南\t望舒\t6.10\t已认证\t\t\t",
    )

    result = diff_sheet(parse_sheet(text), people)

    assert result.errors != []
    assert result.applicable is False
