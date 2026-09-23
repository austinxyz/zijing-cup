"""Participation UTR sampling: snapshot each season player's current doubles UTR
daily, read the window back for the monitor page, and set the rated-day average
as the frozen participation UTR.

The participation UTR is the mean of the 9/21-9/25 doubles UTR. Writes are
guarded by the shared-secret admin middleware (keyed on HTTP method); the read
is behind the shared secret. "Set" reuses the players command's set_season_utr,
so it refuses on a locked season exactly like every other participation write.
"""

from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Player, PlayerDailyUtr, PlayerTeamMembership, Season, Team
from app.players import command

router = APIRouter(prefix="/api", tags=["utr-sampling"])

_SEASON = "/seasons/{year}/participation-utr"

# The sampling window (9/21-9/25) is stated in the competition's local time.
# Render runs UTC, so date.today() there rolls over ~5pm PT — a snapshot taken
# on the evening of 9/21 PT would file under 9/22 and shift the whole window.
SAMPLING_TZ = ZoneInfo("America/Los_Angeles")


def _sampling_today(now: Optional[datetime] = None) -> date:
    """Today's calendar date in the competition timezone (LA), not the server's."""
    moment = now or datetime.now(timezone.utc)
    return moment.astimezone(SAMPLING_TZ).date()


def _season_player_ids(session: Session, year: int) -> list[int]:
    """Every player with a team membership in this season (both divisions)."""
    rows = session.exec(
        select(PlayerTeamMembership.player_id)
        .join(Team, PlayerTeamMembership.team_id == Team.id)
        .where(Team.season_year == year)
    ).all()
    # De-dup (a player could hold memberships in both divisions).
    seen: set[int] = set()
    out: list[int] = []
    for pid in rows:
        if pid not in seen:
            seen.add(pid)
            out.append(pid)
    return out


@router.post(_SEASON + "/snapshot")
def snapshot_today(year: int, session: Session = Depends(get_session)) -> dict:
    """Snapshot every season player's CURRENT doubles UTR + status under today's
    date (server clock). Re-running the same day upserts that day's row rather
    than piling up duplicates. All-or-nothing: one commit."""
    if session.get(Season, year) is None:
        raise HTTPException(status_code=404, detail=f"no season {year}")

    today = _sampling_today()
    player_ids = _season_player_ids(session, year)
    people = {
        p.id: p
        for p in session.exec(select(Player).where(Player.id.in_(player_ids))).all()
    }
    existing = {
        r.player_id: r
        for r in session.exec(
            select(PlayerDailyUtr).where(
                PlayerDailyUtr.season_year == year,
                PlayerDailyUtr.sample_date == today,
                PlayerDailyUtr.player_id.in_(player_ids),
            )
        ).all()
    }
    for pid in player_ids:
        person = people[pid]
        row = existing.get(pid)
        if row is None:
            row = PlayerDailyUtr(season_year=year, player_id=pid, sample_date=today)
        row.doubles_utr = person.doubles_utr
        row.doubles_status = person.doubles_status
        session.add(row)
    session.commit()
    return {"snapshotted": len(player_ids), "sample_date": today.isoformat()}


def _rated_avg(samples: list[PlayerDailyUtr]) -> Optional[Decimal]:
    """Mean of the rated days' doubles UTR, 2dp round-half-up. Decimal end to
    end. None when no rated day carries a value."""
    vals = [
        s.doubles_utr
        for s in samples
        if s.doubles_status == "rated" and s.doubles_utr is not None
    ]
    if not vals:
        return None
    mean = sum(vals, Decimal(0)) / Decimal(len(vals))
    return mean.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.get(_SEASON)
def read_season_sampling(
    year: int, session: Session = Depends(get_session)
) -> list[dict]:
    """Every season player's daily samples + rated-day average + review flag,
    for the monitor page. A player is `needs_review` if any sampled day is not
    rated (projected/unrated); `can_set` (the average may be set as the frozen
    participation UTR) requires every sampled day rated and an average to exist."""
    player_ids = _season_player_ids(session, year)
    if not player_ids:
        return []
    people = {
        p.id: p
        for p in session.exec(select(Player).where(Player.id.in_(player_ids))).all()
    }
    # player_id -> every division the player has a team in (a player can be on
    # both a gold and a silver team; keying by a single code would drop one and
    # hide the player from that division's filter). Ordered gold before silver.
    div_rows = session.exec(
        select(PlayerTeamMembership.player_id, Team.division_code)
        .join(Team, PlayerTeamMembership.team_id == Team.id)
        .where(Team.season_year == year)
    ).all()
    _DIV_ORDER = {"gold": 0, "silver": 1}
    divisions: dict[int, list[str]] = {}
    for pid, code in div_rows:
        codes = divisions.setdefault(pid, [])
        if code not in codes:
            codes.append(code)
    for codes in divisions.values():
        codes.sort(key=lambda c: (_DIV_ORDER.get(c, 99), c))

    samples_by_player: dict[int, list[PlayerDailyUtr]] = {}
    for s in session.exec(
        select(PlayerDailyUtr)
        .where(PlayerDailyUtr.season_year == year)
        .order_by(PlayerDailyUtr.sample_date)
    ).all():
        samples_by_player.setdefault(s.player_id, []).append(s)

    out: list[dict] = []
    for pid in player_ids:
        person = people[pid]
        samples = samples_by_player.get(pid, [])
        avg = _rated_avg(samples)
        has_non_rated = any(s.doubles_status != "rated" for s in samples)
        flag = "needs_review" if (has_non_rated or not samples) else "ok"
        can_set = flag == "ok" and avg is not None
        out.append({
            "player_id": pid,
            "last_name": person.last_name,
            "first_name": person.first_name,
            "gender": person.gender,
            "divisions": divisions.get(pid, []),
            "samples": [
                {
                    "sample_date": s.sample_date.isoformat(),
                    "doubles_utr": str(s.doubles_utr) if s.doubles_utr is not None else None,
                    "doubles_status": s.doubles_status,
                }
                for s in samples
            ],
            "rated_avg": str(avg) if avg is not None else None,
            "flag": flag,
            "can_set": can_set,
        })

    # Men first, then women, then unmarked; within a gender, UTR high→low. The
    # sort UTR is the rated average when there is one, else the latest sampled
    # doubles value, else none (those sort last within their gender).
    def _gender_rank(code: Optional[str]) -> int:
        return {"M": 0, "F": 1}.get(code or "", 2)

    def _sort_utr(row: dict) -> Optional[Decimal]:
        if row["rated_avg"] is not None:
            return Decimal(row["rated_avg"])
        for s in reversed(row["samples"]):
            if s["doubles_utr"] is not None:
                return Decimal(s["doubles_utr"])
        return None

    def _key(row: dict):
        utr = _sort_utr(row)
        # (gender rank, has-a-value-first, UTR descending)
        return (_gender_rank(row["gender"]), 0 if utr is not None else 1, -(utr or Decimal(0)))

    out.sort(key=_key)
    return out


@router.post(_SEASON + "/{player_id}/set")
def set_participation_from_sampling(
    year: int, player_id: int, session: Session = Depends(get_session)
) -> dict:
    """Set the rated-day average as this player's frozen participation UTR.

    Only allowed when every sampled day is rated and an average exists — a
    projected/unrated sample is the committee's to resolve by hand, not ours to
    average away. Writes via the shared set_season_utr command (source
    `admin_ruling`, status `committee`), so a locked season refuses with 409
    exactly like every other participation write — no lock bypass here."""
    samples = session.exec(
        select(PlayerDailyUtr).where(
            PlayerDailyUtr.season_year == year,
            PlayerDailyUtr.player_id == player_id,
        )
    ).all()
    if not samples or any(s.doubles_status != "rated" for s in samples):
        raise HTTPException(
            status_code=422,
            detail="有非 rated 采样天（待核）——请组委会人工核定 match UTR，不可一键定为",
        )
    avg = _rated_avg(samples)
    if avg is None:
        raise HTTPException(status_code=422, detail="无 rated 采样，无均值可定")

    try:
        row = command.set_season_utr(
            session, player_id, year,
            value=avg, source="admin_ruling", status="committee",
        )
    except command.NotFound as error:
        status = 404 if "player" in str(error) else 422
        raise HTTPException(status_code=status, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"player_id": player_id, "value": str(row.value)}
