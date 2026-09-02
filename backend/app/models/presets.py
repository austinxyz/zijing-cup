"""SQLModel mapping for lineup filter presets.

The schema is owned by `supabase/migrations/`; this mirrors it.

`created_at`/`updated_at` are declared with an explicit server_default rather
than a Python default: the columns are NOT NULL with a database default, and a
plain `Optional[datetime] = None` would make SQLModel send an explicit NULL on
insert (a NotNullViolation), not "let the database fill it". The server_default
also keeps the timestamp on one clock — the database's.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class LineupFilterPreset(SQLModel, table=True):
    __tablename__ = "lineup_filter_presets"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    name: str

    #: {"locks": {"D1": ["p12", "p34"], ...}, "excluded": ["p56", ...]}
    constraints: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))

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
