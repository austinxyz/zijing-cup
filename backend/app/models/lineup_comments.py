"""SQLModel mapping for lineup comments (阵容评论).

The schema is owned by `supabase/migrations/`; this mirrors it. A comment is
append-only: one row per remark, never edited in place. Attached to a
`saved_lineup` (FK cascade): deleting the lineup removes its comments. Cloning a
lineup does not copy comments — a clone is a new row and its comment set starts
empty.

`created_at` uses a server_default (NOT NULL with a database default) so an
insert need not send it and the timestamp is the database's clock — the ordering
the timeline relies on comes from one clock, not the app's.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, func
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class LineupComment(SQLModel, table=True):
    __tablename__ = "lineup_comments"
    __table_args__ = ({"schema": SCHEMA},)

    id: Optional[int] = Field(default=None, primary_key=True)
    saved_lineup_id: int = Field(
        sa_column=Column(
            ForeignKey(f"{SCHEMA}.saved_lineups.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    body: str
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
