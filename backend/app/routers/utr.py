"""The two endpoints behind the current-UTR round trip.

Its own router rather than a corner of the players one: the read is addressed
by team, the write by player id, and neither belongs under the other's prefix.

The write is deliberately narrow — five columns, nothing else. The sheet's
safety argument is that the name in each row still matches the id beside it,
so an import that could also rewrite names would quietly dismantle its own
check.
"""

from decimal import Decimal
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    SeasonLock,
    Team,
)
from app.players.utr_sheet import (
    DiffResult,
    PlayerView,
    diff_sheet,
    parse_sheet,
)
from app.rosters.query import get_team_roster

router = APIRouter(prefix="/api", tags=["utr"])

#: Doubles-UTR statuses that must NOT mirror into the participation UTR: a
#: projected or unrated number is not a settled rating, and the participation
#: UTR is the value every lineup is checked against.
_NON_MIRRORING_STATUSES = {"projected", "unrated"}


class SheetRowOut(BaseModel):
    """One row of the exported sheet.

    `player_id` is the whole point: it goes out with the sheet and comes back
    untouched, so importing never has to work out which player a row is
    about. The names ride along as a check on that, not as a way to find
    anyone.
    """

    player_id: int
    last_name: str
    first_name: str

    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None
    utr_profile_id: Optional[str] = None


@router.get(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/utr-sheet/elsewhere",
    response_model=dict[str, list[str]],
)
def read_other_memberships(
    year: int,
    code: str,
    team_code: str,
    session: Session = Depends(get_session),
) -> dict[str, list[str]]:
    """Which of this team's players also appear on some other team.

    A current UTR belongs to the player, not to a team or a season, so a
    change made from one team's sheet shows up on every page that player
    appears on. That is right — one person has one current rating — and it is
    also surprising, so the confirmation screen names these people rather
    than letting the reader assume they only touched this squad.

    One query for the whole team, not one per player.
    """
    roster = get_team_roster(session, year, code, team_code)
    if roster is None:
        raise HTTPException(status_code=404, detail="team not found")

    ids = [entry.player_id for entry in roster.players]
    if not ids:
        return {}

    rows = session.exec(
        select(PlayerTeamMembership.player_id, Team.division_code, Team.code)
        .join(Team, Team.id == PlayerTeamMembership.team_id)
        .where(PlayerTeamMembership.player_id.in_(ids))
    ).all()

    elsewhere: dict[str, list[str]] = {}
    for player_id, division_code, other_code in rows:
        if division_code == code and other_code == team_code:
            continue
        elsewhere.setdefault(str(player_id), []).append(
            f"{division_code} · {other_code}"
        )
    return elsewhere


class SheetText(BaseModel):
    text: str


class FieldChangeOut(BaseModel):
    field: str
    #: null means the field had no value. A field that produced no
    #: FieldChange at all is a different claim, and is rendered as 「不变」.
    old: Optional[str] = None
    new: Optional[str] = None


class PlayerChangeOut(BaseModel):
    player_id: int
    last_name: str
    first_name: str
    fields: list[FieldChangeOut]


class SheetErrorOut(BaseModel):
    line_number: int
    message: str


class SheetDiffOut(BaseModel):
    """What a sheet would change, and everything wrong with it.

    Declared rather than returned as a bare dict so the shape reaches the
    OpenAPI schema: the frontend's type for this payload should be a checked
    contract, not an assertion it makes about a dict it hopes matches.
    """

    changes: list[PlayerChangeOut]
    errors: list[SheetErrorOut]
    counts: dict[str, int]
    covered: int
    not_covered: int

    #: False when anything is wrong. All or nothing — a column pasted one
    #: place over makes nearly every row wrong, and writing the rest would
    #: leave the database half new and half old.
    applicable: bool

    #: Player id -> the other teams that player also sits on.
    elsewhere: dict[str, list[str]]


class AppliedOut(BaseModel):
    updated: int


@router.post(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/utr-sheet/preview",
    response_model=SheetDiffOut,
)
def preview_sheet(
    year: int,
    code: str,
    team_code: str,
    payload: SheetText,
    session: Session = Depends(get_session),
) -> SheetDiffOut:
    """What this sheet would change. Writes nothing.

    A POST because the sheet arrives in the body — it can run to thousands of
    characters — not because it changes anything.
    """
    result, _ = _diff_for(session, year, code, team_code, payload.text)
    return _diff_payload(result, session, year, code, team_code)


@router.post(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/utr-sheet/apply",
    response_model=AppliedOut,
)
def apply_sheet(
    year: int,
    code: str,
    team_code: str,
    payload: SheetText,
    session: Session = Depends(get_session),
) -> AppliedOut:
    """Write what preview showed, or nothing.

    Re-derives the diff from the sheet text rather than accepting a diff from
    the client: what lands is then computed from the same source under the
    same rules as what the person read, not from a payload that could have
    been altered on the way back.
    """
    result, people = _diff_for(session, year, code, team_code, payload.text)
    if not result.applicable:
        raise HTTPException(
            status_code=422,
            detail=[
                {"line": e.line_number, "message": e.message}
                for e in result.errors
            ],
        )

    by_id = {person.id: person for person in people}
    for change in result.changes:
        person = by_id[change.player_id]
        for field in change.fields:
            setattr(person, field.field, _typed(field.field, field.new))
        session.add(person)

        # Same rule as the inline edit reaches through the batch endpoint:
        # two ways in, one meaning for "I filled in a doubles UTR".
        doubles = next(
            (f for f in change.fields if f.field == "doubles_utr"), None
        )
        if doubles is not None and doubles.new is not None:
            _mirror_participation(
                session, person.id, year, Decimal(doubles.new)
            )

    session.commit()
    return AppliedOut(updated=len(result.changes))


def _typed(field: str, value: Optional[str]) -> Union[Decimal, str, None]:
    if value is None:
        return None
    if field in {"singles_utr", "doubles_utr"}:
        return Decimal(value)
    return value


def _diff_for(
    session: Session, year: int, code: str, team_code: str, text: str
) -> tuple[DiffResult, list[Player]]:
    roster = get_team_roster(session, year, code, team_code)
    if roster is None:
        raise HTTPException(status_code=404, detail="team not found")

    ids = [entry.player_id for entry in roster.players]
    people = list(
        session.exec(select(Player).where(Player.id.in_(ids))).all()
    ) if ids else []
    # Ordered as the roster is, so `covered`/`not_covered` count the same
    # squad the person was looking at.
    by_id = {person.id: person for person in people}
    ordered = [by_id[i] for i in ids if i in by_id]

    views = [
        PlayerView(
            player_id=person.id,
            last_name=person.last_name,
            first_name=person.first_name,
            singles_utr=person.singles_utr,
            singles_status=person.singles_status,
            doubles_utr=person.doubles_utr,
            doubles_status=person.doubles_status,
            utr_profile_id=person.utr_profile_id,
        )
        for person in ordered
    ]
    return diff_sheet(parse_sheet(text), views), ordered


def _diff_payload(
    result: DiffResult,
    session: Session,
    year: int,
    code: str,
    team_code: str,
) -> SheetDiffOut:
    return SheetDiffOut(
        changes=[
            PlayerChangeOut(
                player_id=change.player_id,
                last_name=change.last_name,
                first_name=change.first_name,
                fields=[
                    FieldChangeOut(field=f.field, old=f.old, new=f.new)
                    for f in change.fields
                ],
            )
            for change in result.changes
        ],
        errors=[
            SheetErrorOut(line_number=e.line_number, message=e.message)
            for e in result.errors
        ],
        counts=result.counts,
        covered=result.covered,
        not_covered=result.not_covered,
        applicable=result.applicable,
        elsewhere=read_other_memberships(year, code, team_code, session),
    )


class CurrentUtrUpdate(BaseModel):
    """One player's new values.

    Every field is optional and absent means "leave it alone" — the sheet's
    blank cell, carried through. Only these five exist on purpose: an import
    that could also rewrite a name would dismantle the check that the name
    beside each id still matches.
    """

    player_id: int
    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None
    utr_profile_id: Optional[str] = None


class CurrentUtrBatch(BaseModel):
    updates: list[CurrentUtrUpdate]

    #: Which season the caller was looking at. When given and that season is
    #: open, a new current doubles UTR also becomes that season's
    #: participation UTR — see `_mirror_participation`.
    season_year: Optional[int] = None


@router.put("/players/current-utr")
def write_current_utrs(
    batch: CurrentUtrBatch,
    session: Session = Depends(get_session),
) -> dict[str, int]:
    """Apply a whole batch or none of it.

    All-or-nothing because the mistake this feature invites is a whole column
    pasted one place over, and then nearly every row is wrong. Writing the
    good half would leave the database half new and half old with nothing
    recording which half is which.
    """
    people = {
        person.id: person
        for person in session.exec(
            select(Player).where(
                Player.id.in_([u.player_id for u in batch.updates])
            )
        ).all()
    }

    missing = [u.player_id for u in batch.updates if u.player_id not in people]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"unknown player ids: {sorted(missing)}",
        )

    for update in batch.updates:
        person = people[update.player_id]
        # Only the fields this request actually named. `exclude_unset` is what
        # separates "leave it alone" from "set it to null" — both arrive as
        # None otherwise, and they are different instructions.
        named = update.model_dump(exclude_unset=True, exclude={"player_id"})
        for field, value in named.items():
            setattr(person, field, value)
        session.add(person)

        # A projected or unrated doubles UTR is not a settled rating — it must
        # NOT become the participation UTR a lineup is checked against. Only a
        # rated (or unmarked) hand-typed value mirrors. `person.doubles_status`
        # is already the new status here (set above).
        if (
            batch.season_year is not None
            and named.get("doubles_utr") is not None
            and person.doubles_status not in _NON_MIRRORING_STATUSES
        ):
            _mirror_participation(
                session, person.id, batch.season_year, named["doubles_utr"]
            )

    session.commit()
    return {"updated": len(batch.updates)}


def _mirror_participation(
    session: Session, player_id: int, season_year: int, value: Decimal
) -> None:
    """Make the new current doubles UTR this season's participation UTR too.

    Before the sampling window there is no committee figure, so the number
    somebody types by hand is the only one a lineup can be built from. Leaving
    it in the 「当前 UTR」 column alone would mean filling in a value that
    changes no conclusion anywhere.

    Overwrites whatever is there, committee values included. That is the
    owner's call and it rests on the process: the committee's data is imported
    and the season locked in the same sitting, so "has committee data" and
    "still unlocked" do not overlap in practice. **The lock is the only
    guard** — `source` no longer doubles as one. Forget to lock and one hand
    typed number will silently replace a frozen one.

    Written as `prefilled` with no status: a stand-in, not anybody's
    adjudication, which is why the roster shows it as 待定.
    """
    if session.get(SeasonLock, season_year) is not None:
        return

    row = session.exec(
        select(PlayerSeasonUtr).where(
            PlayerSeasonUtr.player_id == player_id,
            PlayerSeasonUtr.season_year == season_year,
        )
    ).one_or_none()

    if row is None:
        session.add(
            PlayerSeasonUtr(
                player_id=player_id,
                season_year=season_year,
                value=value,
                source="prefilled",
            )
        )
        return

    row.value = value
    row.source = "prefilled"
    row.status = None
    # A hand-typed stand-in settles nothing, so any conflict it used to carry
    # is no longer a conflict — but it is not adjudicated either.
    row.is_unresolved = False
    row.alt_value = None
    session.add(row)


@router.get(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/utr-sheet",
    response_model=list[SheetRowOut],
)
def read_utr_sheet(
    year: int,
    code: str,
    team_code: str,
    session: Session = Depends(get_session),
) -> list[SheetRowOut]:
    # Ordered by the roster query rather than by a second sort written here:
    # the person exports this sheet while looking at the roster page, and two
    # different orders would read as having exported the wrong team.
    roster = get_team_roster(session, year, code, team_code)
    if roster is None:
        raise HTTPException(status_code=404, detail="team not found")

    ids = [entry.player_id for entry in roster.players]
    people = {
        person.id: person
        for person in session.exec(
            select(Player).where(Player.id.in_(ids))
        ).all()
    }

    rows: list[SheetRowOut] = []
    for entry in roster.players:
        person = people[entry.player_id]
        rows.append(
            SheetRowOut(
                player_id=person.id,
                last_name=person.last_name,
                first_name=person.first_name,
                singles_utr=person.singles_utr,
                singles_status=person.singles_status,
                doubles_utr=person.doubles_utr,
                doubles_status=person.doubles_status,
                utr_profile_id=person.utr_profile_id,
            )
        )
    return rows
