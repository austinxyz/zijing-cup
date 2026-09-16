"""Local stdio MCP server: batch-import a team's UTR after scraping it.

Two tools wrap two existing FastAPI endpoints so an on-machine agent can, after
scraping a team's current UTR, push the whole team in one call — skipping the
"write current-utr.csv, then import" middle step:

- `read_team_utr_sheet` → GET .../utr-sheet — gives each player's id + current
  values (so the agent can match scraped values to a player_id).
- `write_team_current_utr` → PUT /api/players/current-utr — writes the batch by
  player_id (all-or-nothing; a season_year mirrors a rated doubles UTR into that
  season's participation UTR, per the endpoint's existing rules).

Architecture: only FastAPI reaches the database. This server therefore talks to
the backend over HTTP ONLY and MUST NOT import app.db / SQLModel / touch the DB.
Matching is the agent's job (it holds names + profile links); this server only
speaks player_id.

Secrets come from the environment (fail-closed): BACKEND_SECRET for reads,
plus ADMIN_SECRET for writes. Nothing is hardcoded. Logs go to stderr — stdout
is the MCP protocol channel.
"""

import logging
import os
import sys
from typing import Any, Optional

import httpx
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
logger = logging.getLogger("utr-import-mcp")

#: Default local backend. Overridable so the same server can point at a backend
#: on another port without code changes.
DEFAULT_BACKEND_URL = "http://127.0.0.1:8011"

#: A generous per-request timeout: the local backend answers fast, but a cold
#: dev instance may lag; better a clear timeout than a hang.
_TIMEOUT = 30.0


class ConfigError(RuntimeError):
    """A required environment variable is missing. Raised instead of sending an
    empty header (which the backend would reject as a bad login — a different,
    misleading failure)."""


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(
            f"{name} 未配置：请在环境中设置它（本地写入口需要），再重试。"
        )
    return value


def _backend_url() -> str:
    return os.environ.get("BACKEND_URL", DEFAULT_BACKEND_URL)


def _make_client() -> httpx.Client:
    return httpx.Client(base_url=_backend_url(), timeout=_TIMEOUT)


def _detail(response: httpx.Response) -> str:
    """The backend's own error text, passed through so the agent can act on it
    ("unknown player ids: [...]", "season 2025 is locked") rather than a generic
    "request failed"."""
    try:
        body = response.json()
    except Exception:
        body = None
    if isinstance(body, dict) and "detail" in body:
        return str(body["detail"])
    return f"{response.request.method} {response.request.url.path} → {response.status_code}"


def read_team_utr_sheet(
    season: int,
    division: str,
    team: str,
    *,
    client: Optional[httpx.Client] = None,
) -> list[dict[str, Any]]:
    """Read a team's UTR sheet: each player's id, name, current singles/doubles
    UTR + status, and UTR profile id. The agent uses the player_id to match
    scraped values before writing them back.

    Raises RuntimeError carrying the backend's own message on any non-2xx
    (e.g. 404 team not found), and ConfigError if BACKEND_SECRET is unset.
    """
    backend_secret = _require_env("BACKEND_SECRET")
    owns = client is None
    client = client or _make_client()
    try:
        response = client.get(
            f"/api/seasons/{season}/divisions/{division}/teams/{team}/utr-sheet",
            headers={"X-Backend-Secret": backend_secret},
        )
    except httpx.RequestError as error:
        logger.error("backend unreachable at %s: %s", _backend_url(), error)
        raise RuntimeError(
            f"后端不可达（{_backend_url()}）：{error}。确认本地后端在运行。"
        ) from error
    finally:
        if owns:
            client.close()
    if response.status_code != 200:
        detail = _detail(response)
        logger.error("read_team_utr_sheet failed: %s", detail)
        raise RuntimeError(detail)
    return response.json()


def write_team_current_utr(
    season: int,
    division: str,
    team: str,
    updates: list[dict[str, Any]],
    season_year: Optional[int] = None,
    *,
    client: Optional[httpx.Client] = None,
) -> dict[str, Any]:
    """Write a batch of current UTR values by player_id (all-or-nothing).

    `season`/`division`/`team` are the agent's context; the endpoint writes by
    player_id, so only `updates` (+ `season_year`) go on the wire. Each update is
    forwarded VERBATIM: a key you include is written, a key you omit is left
    alone, and an explicit null clears that value — the backend's exclude_unset
    tells those apart, so this function must not "helpfully" fill in omitted keys.

    Pass `season_year` to let a rated doubles UTR mirror into that season's
    participation UTR (the endpoint's existing rule; projected/unrated or a
    locked season do not mirror — not re-implemented here).

    Raises RuntimeError carrying the backend's own message on any non-2xx
    (e.g. "unknown player ids: [...]", "season 2025 is locked"), and ConfigError
    if BACKEND_SECRET or ADMIN_SECRET is unset.
    """
    backend_secret = _require_env("BACKEND_SECRET")
    admin_secret = _require_env("ADMIN_SECRET")
    body: dict[str, Any] = {"updates": updates}
    if season_year is not None:
        body["season_year"] = season_year

    owns = client is None
    client = client or _make_client()
    try:
        response = client.put(
            "/api/players/current-utr",
            headers={
                "X-Backend-Secret": backend_secret,
                "X-Admin-Secret": admin_secret,
            },
            json=body,
        )
    except httpx.RequestError as error:
        logger.error("backend unreachable at %s: %s", _backend_url(), error)
        raise RuntimeError(
            f"后端不可达（{_backend_url()}）：{error}。确认本地后端在运行。"
        ) from error
    finally:
        if owns:
            client.close()
    if response.status_code != 200:
        detail = _detail(response)
        logger.error("write_team_current_utr failed: %s", detail)
        raise RuntimeError(detail)
    return response.json()


# --- MCP wiring ---------------------------------------------------------------
# The tools are thin: each delegates to the plain function above (which the tests
# drive directly with an injected client). The server owns the real client.

mcp = FastMCP("utr-import-mcp")


@mcp.tool(name="read_team_utr_sheet")
def read_team_utr_sheet_tool(
    season: int, division: str, team: str
) -> list[dict[str, Any]]:
    """Read a team's current UTR sheet (player_id + names + singles/doubles UTR +
    status + UTR profile id). Use it to get each player's id before writing."""
    return read_team_utr_sheet(season, division, team)


@mcp.tool(name="write_team_current_utr")
def write_team_current_utr_tool(
    season: int,
    division: str,
    team: str,
    updates: list[dict[str, Any]],
    season_year: Optional[int] = None,
) -> dict[str, Any]:
    """Write a batch of current UTR by player_id (all-or-nothing). Each update is
    `{player_id, doubles_utr?, doubles_status?, singles_utr?, singles_status?,
    utr_profile_id?}` — include a field to set it, omit to leave it alone, use
    null to clear it. Pass season_year to mirror a rated doubles UTR into that
    season's participation UTR (backend rule). First call read_team_utr_sheet to
    get each player_id."""
    return write_team_current_utr(season, division, team, updates, season_year)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
