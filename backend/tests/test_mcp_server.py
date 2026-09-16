"""Local stdio MCP server that wraps two existing FastAPI endpoints so an
on-machine agent can batch-import a team's current UTR after scraping it.

The server talks to the backend over HTTP only — it MUST NOT import app.db or
touch the database (architecture: only FastAPI reaches the DB). These tests use
httpx MockTransport to assert the requests it makes (path, headers, body) and
that it never pulls in the DB layer.

All names/ids are invented.
"""

import os
import subprocess
import sys

import httpx
import pytest


def _client(handler):
    """An httpx.Client wired to a MockTransport, base_url matching the server's
    default backend. The server code accepts an injected client for tests."""
    return httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="http://127.0.0.1:8011",
    )


def test_importing_mcp_server_does_not_touch_the_db():
    # A fresh interpreter: importing the MCP server must not import app.db (the
    # only module that opens a database connection). Run in a subprocess so
    # other test modules that DID import app.db don't pollute sys.modules.
    code = (
        "import sys, app.mcp_server; "
        "assert 'app.db' not in sys.modules, sorted(m for m in sys.modules if m.startswith('app.'))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(__file__)),
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_read_tool_is_registered_under_the_contract_name():
    # The MCP tool must be exposed as "read_team_utr_sheet" (the contract name),
    # not the wrapper function's own name.
    import asyncio

    from app import mcp_server

    names = {t.name for t in asyncio.run(mcp_server.mcp.list_tools())}
    assert "read_team_utr_sheet" in names, names


class TestReadTeamUtrSheet:
    def test_reads_the_teams_utr_sheet_with_the_backend_secret(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        from app import mcp_server

        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["path"] = request.url.path
            seen["backend_secret"] = request.headers.get("X-Backend-Secret")
            seen["method"] = request.method
            return httpx.Response(
                200,
                json=[
                    {
                        "player_id": 12,
                        "last_name": "南",
                        "first_name": "甲",
                        "singles_utr": "7.00",
                        "singles_status": "Rated",
                        "doubles_utr": "6.50",
                        "doubles_status": "Rated",
                        "utr_profile_id": "4443570",
                    }
                ],
            )

        rows = mcp_server.read_team_utr_sheet(
            2025, "silver", "PKU", client=_client(handler)
        )

        assert seen["method"] == "GET"
        assert seen["path"] == "/api/seasons/2025/divisions/silver/teams/PKU/utr-sheet"
        assert seen["backend_secret"] == "test-secret"
        assert rows[0]["player_id"] == 12
        assert rows[0]["doubles_utr"] == "6.50"
        assert rows[0]["utr_profile_id"] == "4443570"

    def test_unknown_team_passes_the_backend_404_through(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        from app import mcp_server

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"detail": "team not found"})

        with pytest.raises(RuntimeError, match="team not found"):
            mcp_server.read_team_utr_sheet(
                2025, "silver", "NOPE", client=_client(handler)
            )

    def test_backend_unreachable_gives_a_clear_message(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        from app import mcp_server

        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        with pytest.raises(RuntimeError, match="后端不可达"):
            mcp_server.read_team_utr_sheet(
                2025, "silver", "PKU", client=_client(handler)
            )

    def test_missing_backend_secret_is_a_clear_config_error_no_request(
        self, monkeypatch
    ):
        monkeypatch.delenv("BACKEND_SECRET", raising=False)
        from app import mcp_server

        called = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            called["n"] += 1
            return httpx.Response(200, json=[])

        with pytest.raises(mcp_server.ConfigError, match="BACKEND_SECRET"):
            mcp_server.read_team_utr_sheet(
                2025, "silver", "PKU", client=_client(handler)
            )
        # Fail-closed: it must not have sent a request with an empty secret.
        assert called["n"] == 0


class TestWriteTeamCurrentUtr:
    def test_writes_the_batch_by_id_with_both_secrets(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        monkeypatch.setenv("ADMIN_SECRET", "admin-secret")
        from app import mcp_server

        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json

            seen["method"] = request.method
            seen["path"] = request.url.path
            seen["backend_secret"] = request.headers.get("X-Backend-Secret")
            seen["admin_secret"] = request.headers.get("X-Admin-Secret")
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"updated": 1})

        result = mcp_server.write_team_current_utr(
            2025,
            "silver",
            "PKU",
            updates=[
                {"player_id": 12, "doubles_utr": "6.60", "doubles_status": "Rated"}
            ],
            season_year=2025,
            client=_client(handler),
        )

        assert seen["method"] == "PUT"
        assert seen["path"] == "/api/players/current-utr"
        assert seen["backend_secret"] == "test-secret"
        assert seen["admin_secret"] == "admin-secret"
        assert seen["body"]["season_year"] == 2025
        assert seen["body"]["updates"][0]["player_id"] == 12
        assert seen["body"]["updates"][0]["doubles_utr"] == "6.60"
        assert result == {"updated": 1}

    def test_unknown_id_passes_the_422_through(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        monkeypatch.setenv("ADMIN_SECRET", "admin-secret")
        from app import mcp_server

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(422, json={"detail": "unknown player ids: [999]"})

        with pytest.raises(RuntimeError, match=r"unknown player ids"):
            mcp_server.write_team_current_utr(
                2025,
                "silver",
                "PKU",
                updates=[{"player_id": 999, "doubles_utr": "6.0"}],
                client=_client(handler),
            )

    def test_omitted_field_is_absent_and_explicit_null_is_sent(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        monkeypatch.setenv("ADMIN_SECRET", "admin-secret")
        from app import mcp_server

        seen = {}

        def handler(request: httpx.Request) -> httpx.Response:
            import json

            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"updated": 1})

        mcp_server.write_team_current_utr(
            2025,
            "silver",
            "PKU",
            # singles_utr omitted (leave alone); doubles_utr explicit null (clear)
            updates=[{"player_id": 12, "doubles_utr": None}],
            client=_client(handler),
        )
        row = seen["body"]["updates"][0]
        assert "singles_utr" not in row  # omitted → not sent → endpoint leaves it
        assert "doubles_utr" in row and row["doubles_utr"] is None  # explicit clear

    def test_missing_admin_secret_is_a_clear_config_error_no_request(self, monkeypatch):
        monkeypatch.setenv("BACKEND_SECRET", "test-secret")
        monkeypatch.delenv("ADMIN_SECRET", raising=False)
        from app import mcp_server

        called = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            called["n"] += 1
            return httpx.Response(200, json={"updated": 0})

        with pytest.raises(mcp_server.ConfigError, match="ADMIN_SECRET"):
            mcp_server.write_team_current_utr(
                2025,
                "silver",
                "PKU",
                updates=[{"player_id": 12, "doubles_utr": "6.0"}],
                client=_client(handler),
            )
        assert called["n"] == 0
