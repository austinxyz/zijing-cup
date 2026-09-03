"""SQLModel mapping for saved lineups.

The schema is owned by `supabase/migrations/`; this mirrors it. Timestamps use
an explicit server_default (NOT NULL columns with a database default): a plain
`Optional[datetime] = None` would make SQLModel send an explicit NULL on insert
rather than letting the database fill it.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class SavedLineup(SQLModel, table=True):
    __tablename__ = "saved_lineups"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    name: str

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
