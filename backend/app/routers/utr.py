"""The two endpoints behind the current-UTR round trip.

Its own router rather than a corner of the players one: the read is addressed
by team, the write by player id, and neither belongs under the other's prefix.

The write is deliberately narrow — five columns, nothing else. The sheet's
safety argument is that the name in each row still matches the id beside it,
so an import that could also rewrite names would quietly dismantle its own
check.
"""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Player, PlayerTeamMembership, Team
from app.players.utr_sheet import (
    DiffResult,
    PlayerView,
    diff_sheet,
    parse_sheet,
)
from app.rosters.query import get_team_roster

router = APIRouter(prefix="/api", tags=["utr"])


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
    session.commit()
    return AppliedOut(updated=len(result.changes))


def _typed(field: str, value: Optional[str]):
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

    session.commit()
    return {"updated": len(batch.updates)}


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
