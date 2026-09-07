"""SQLModel mapping for player scouting notes (球员评价).

The schema is owned by `supabase/migrations/`; this mirrors it. A note is
append-only: one row per observation, never edited in place. `category` is
constrained to a fixed set both here (documented) and by a DB CHECK (enforced).
`created_at` uses a server_default (NOT NULL with a database default) so an
insert need not send it and the timestamp is the database's clock — the ordering
the timeline relies on comes from one clock, not the app's.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, func
from sqlmodel import Field, SQLModel

from app.db import SCHEMA

#: The only categories a note may carry. Enforced by a DB CHECK; mirrored here
#: for the request model's validation so an illegal category is a 422, not a 500.
NOTE_CATEGORIES = ("strength", "weakness", "partner", "other")


class PlayerNote(SQLModel, table=True):
    __tablename__ = "player_notes"
    __table_args__ = ({"schema": SCHEMA},)

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(
        sa_column=Column(
            ForeignKey(f"{SCHEMA}.players.id", ondelete="CASCADE"), nullable=False
        )
    )
    category: str
    body: str
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
