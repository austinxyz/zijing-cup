"""SQLModel mappings for teams and roster entries.

The schema is owned by `supabase/migrations/`; these mirror it.

Two things the type hints are load-bearing for:

- `is_borrowed_player` is `Optional[bool]`, not `bool`. None means nobody has
  marked this player, which is a different claim from "confirmed not a
  borrowed player". The rules cap borrowed players per team and per match, so
  collapsing the two would let downstream report a lineup as checked when it
  never was.
- `rating_class` is Optional for the same shape of reason: the importer can
  only determine it for Rated and Projected players.
"""

from decimal import Decimal
from typing import Optional

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.types import Numeric
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class Team(SQLModel, table=True):
    __tablename__ = "teams"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)

    season_year: int
    division_code: str

    # The committee sheet's own string, stored verbatim: not split into member
    # schools, not normalised, not alias-merged. The sheet spells the same
    # team differently across tabs, so parsing here would decide on a human's
    # behalf.
    code: str

    # ---- human-owned, never written by the roster importer -----------------

    # An optional friendlier name, maintained in a seed file. Sparse on
    # purpose: most joint sides have no natural Chinese name, and the code is
    # what people actually say. None means nobody has named this team — the
    # importer must leave it exactly as it found it.
    display_name: Optional[str] = None


class RosterEntry(SQLModel, table=True):
    __tablename__ = "roster_entries"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    # ---- owned by the committee CSV ----------------------------------------

    last_name: str
    first_name: str
    gender: Optional[str] = None

    # The participation UTR: the frozen value the event actually uses.
    match_utr: Decimal

    # The sheet's status word including any "/ Appeal" suffix, kept verbatim.
    dutr_status: str

    # Where match_utr came from ("Zijing Cup 2024 UTR", "Captain Provided
    # UTR"). The only evidence for classifying an Unrated player.
    source_note: Optional[str] = None

    # Daily values across the sampling window, in column order.
    daily_utrs: Optional[list[Decimal]] = Field(
        default=None, sa_column=Column(ARRAY(Numeric(5, 2)), nullable=True)
    )

    # ---- maintained by hand; the importer never writes these ---------------

    rating_class: Optional[str] = None
    utr_profile_id: Optional[str] = None
    is_borrowed_player: Optional[bool] = None
