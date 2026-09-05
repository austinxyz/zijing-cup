"""SQLModel mapping for saved lineups.

The schema is owned by `supabase/migrations/`; this mirrors it. Timestamps use
an explicit server_default (NOT NULL columns with a database default): a plain
`Optional[datetime] = None` would make SQLModel send an explicit NULL on insert
rather than letting the database fill it.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column, DateTime, Integer, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class SavedLineup(SQLModel, table=True):
    __tablename__ = "saved_lineups"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    name: str

    #: Display order within a team, ascending. NOT NULL with a database default
    #: of 0 (an int has no "unknown" state — 0 is a fine initial value), so an
    #: insert need not supply it. New rows are given max+1 by save_lineup; the
    #: migration backfills existing rows by name so the order does not jump when
    #: the list switches from name-ordering to this.
    sort_order: int = Field(
        sa_column=Column(Integer, server_default=text("0"), nullable=False)
    )

    #: {"D1": ["p12", "p34"], ...}
    assignment: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))

    #: {"p12": "6.98", ...} — read-only history, never written back to a UTR.
    utr_snapshot: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
