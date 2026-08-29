"""SQLModel mappings for the player registry.

The schema is owned by `supabase/migrations/` — these classes mirror it, they
do not create it. Two things here have to match the migration exactly or the
model quietly permits what the database refuses:

- `(player_id, season_year)` is unique. A conflict therefore cannot be two
  rows; it is one row carrying a second candidate value.
- The two status vocabularies are separate. `players.singles_status` speaks
  UTR's own words; `PlayerSeasonUtr.status` speaks the committee's. They look
  similar and mean different things, so they are defined apart and neither is
  derived from the other.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, func
from sqlalchemy.types import TIMESTAMP
from sqlmodel import Field, SQLModel

from app.db import SCHEMA

#: What the UTR site says about a live rating.
CURRENT_UTR_STATUSES = {"unrated", "projected", "rated"}

#: How the committee decided a participation value. 'captain' (队长评定) has no
#: counterpart on the UTR site, which is why this is a separate vocabulary
#: rather than the same one in another language.
SEASON_UTR_STATUSES = {"verified", "committee", "captain"}

#: Where a participation UTR came from. 'prefilled' is a guess copied from the
#: player's current UTR; without this distinction it would be indistinguishable
#: from a frozen official value and the cap arithmetic would treat it as one.
SEASON_UTR_SOURCES = {"prefilled", "committee_sheet", "admin_ruling"}


class Player(SQLModel, table=True):
    __tablename__ = "players"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)

    last_name: str
    first_name: str

    #: Nullable, as on the roster snapshot: the sheet leaves it blank
    #: sometimes, and picking a side would invent a player there.
    gender: Optional[str] = None

    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None

    #: The only evidence that two records are the same human. Today no roster
    #: row has one, which is why identity starts as a name-based guess.
    utr_profile_id: Optional[str] = None


class PlayerSeasonUtr(SQLModel, table=True):
    __tablename__ = "player_season_utrs"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key=f"{SCHEMA}.players.id")
    season_year: int = Field(foreign_key=f"{SCHEMA}.seasons.year")

    #: The value that gets read. While a conflict is unresolved this is the
    #: LARGER candidate — participation UTR is used almost entirely as an upper
    #: bound, so guessing low would show an illegal lineup as legal.
    value: Decimal

    #: The other candidate, kept rather than discarded. None when there is no
    #: conflict.
    alt_value: Optional[Decimal] = None

    is_unresolved: bool = False

    #: None means "nobody has decided", not missing data: an Unrated sheet row
    #: could be committee-adjudicated or captain-rated depending on USTA match
    #: history the sheet does not carry. Same reasoning as
    #: roster_entries.rating_class, which the roster page shows as 待定.
    status: Optional[str] = None
    #: Rides on top of `status` instead of replacing it: the real sheet has
    #: Rated / Appeal, Projected / Appeal and Unrated / Appeal.
    under_appeal: bool = False

    source: str


class PlayerTeamMembership(SQLModel, table=True):
    __tablename__ = "player_team_memberships"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key=f"{SCHEMA}.players.id")
    team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    #: Free text, not a foreign key: team codes are hand-written composites the
    #: sheet spells differently across tabs, so a lookup table would inherit
    #: that alias problem.
    representing_school: Optional[str] = None

    #: Three-state, like the roster's flag: None means nobody has marked this,
    #: which is NOT the same claim as "confirmed not one".
    is_borrowed_player: Optional[bool] = None

    #: Not the same thing as borrowed despite sounding close — it means the
    #: player is not from the current school and needs committee approval, and
    #: it does not affect eligibility.
    is_wildcard: Optional[bool] = None


class SeasonLock(SQLModel, table=True):
    __tablename__ = "season_locks"
    __table_args__ = {"schema": SCHEMA}

    #: Locked per season, not per (season, division): the two divisions belong
    #: to one event.
    season_year: int = Field(
        primary_key=True, foreign_key=f"{SCHEMA}.seasons.year"
    )

    #: Stamped by the database, not by Python. The column is NOT NULL with a
    #: `now()` default, and `server_default` is what tells SQLAlchemy to leave
    #: it out of the INSERT rather than send an explicit NULL — without it,
    #: locking a season raises NotNullViolation and the freeze is unreachable.
    #: The clock stays on one side: two clocks would disagree about which of
    #: two edits happened before the lock.
    locked_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
        ),
    )
    note: Optional[str] = None
