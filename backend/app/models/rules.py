"""SQLModel mappings for the competition-rules tables.

The schema is owned by `supabase/migrations/` — these classes mirror it, they
do not create it. Nullability has to match the migration exactly: `cap` is
Optional because a NULL cap means "open line", which is a rule state, not
missing data.
"""

from decimal import Decimal
from typing import Optional

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.types import Text
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class Season(SQLModel, table=True):
    __tablename__ = "seasons"
    __table_args__ = {"schema": SCHEMA}

    year: int = Field(primary_key=True)
    edition_name: Optional[str] = None


class Division(SQLModel, table=True):
    __tablename__ = "divisions"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    season_year: int = Field(foreign_key=f"{SCHEMA}.seasons.year")

    # `code` is the URL segment ('gold' / 'silver'); `display_name` is what
    # the UI shows (金组 / 银组). Keeping them apart lets routes stay ASCII.
    code: str
    display_name: str

    # 'match_count' (silver: count line wins) or 'points' (gold from 2026:
    # weighted score out of 8).
    scoring_mode: str

    # Two distinct allowances, not one — see the migration's comment. Equal in
    # 2026 for both divisions; 0 for seasons before the buffer system.
    buffer_per_line: Decimal = Decimal("0")
    buffer_total: Decimal = Decimal("0")

    partner_gap_max: Decimal

    # Flag only. The rules text gives no numeric definition of the
    # men's-doubles ordering, so the comparison is not decided here.
    mens_doubles_must_be_ordered: bool = True


class DivisionLine(SQLModel, table=True):
    __tablename__ = "division_lines"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    division_id: int = Field(foreign_key=f"{SCHEMA}.divisions.id")

    code: str
    kind: str
    sort_order: int

    # None means open line: no ceiling at all. Not a sentinel and not a large
    # number — the absence of a limit is itself the rule.
    cap: Optional[Decimal] = None

    points: int


class DivisionEligibilityLimit(SQLModel, table=True):
    __tablename__ = "division_eligibility_limits"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    division_id: int = Field(foreign_key=f"{SCHEMA}.divisions.id")

    gender: str
    utr_above: Decimal
    max_players: int

    # None means "any line". An empty list would mean "no line at all" — a
    # different and nonsensical statement, which the migration rejects.
    restricted_to_lines: Optional[list[str]] = Field(
        default=None, sa_column=Column(ARRAY(Text()), nullable=True)
    )


class DivisionBorrowedLimit(SQLModel, table=True):
    """Per-match borrowed-player ceiling, keyed on how many schools the team
    combines. One row per (division, school_count): the roster cap (how many
    borrowed players may be on the team) and the on-court cap (how many may
    play in a single match). Data-driven and per-division so the rule can
    change year to year without a code change — the engine reads it, the seed
    files own the values."""

    __tablename__ = "division_borrowed_limits"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    division_id: int = Field(foreign_key=f"{SCHEMA}.divisions.id")

    #: How many schools the (联队) team combines. 1..4 in the current rules.
    school_count: int
    #: Most borrowed players allowed on the roster for a team of this many
    #: schools. Data-entry validation only (warn, not block).
    roster_cap: int
    #: Most borrowed players allowed on court in one match — the hard rule the
    #: lineup engine enforces.
    on_court_cap: int
