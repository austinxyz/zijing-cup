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
from app.models import Player
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
