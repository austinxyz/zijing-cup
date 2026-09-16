## Contract — Group 1: MCP server 骨架 + read_team_utr_sheet + 不碰 DB + 密钥 fail-closed

- **Spec**:
  - 系统 SHALL 提供一个本地 stdio MCP server（`backend/app/mcp_server.py`，官方 `mcp` SDK）。它 SHALL 只通过 HTTP（`httpx`）调用本地 FastAPI，MUST NOT import `app.db`、MUST NOT 直连数据库。`BACKEND_URL` 从环境读（默认 `http://127.0.0.1:8011`）。日志 MUST 走 stderr。
  - 系统 SHALL 暴露工具 `read_team_utr_sheet(season, division, team)`，包 `GET /api/seasons/{season}/divisions/{division}/teams/{team}/utr-sheet`，回该队每人 `{player_id, last_name, first_name, singles_utr, singles_status, doubles_utr, doubles_status, utr_profile_id}`。读 SHALL 带 `X-Backend-Secret`。未知队 SHALL 把后端 404 透传成工具错误。
  - MCP SHALL 从环境读 `BACKEND_SECRET`（读写都要），缺失时 SHALL 明确报「未配置」而不是发空头。密钥 MUST NOT 硬编码/明文进仓库。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_mcp_server.py -q` → expected: 读工具用例全过（httpx MockTransport 断言 GET 路径+`X-Backend-Secret` 头、正常回行、404 透传、缺 BACKEND_SECRET 报未配置、import 不触发 DB）。
- **Code**:
  - `FastMCP`（mcp 1.30.0，`from mcp.server.fastmcp import FastMCP`）；跑法 `.venv-std python -m app.mcp_server`。
  - **绝不 import `app.db`/SQLModel**；配守卫测试（import `app.mcp_server` 后 `app.db` 不在 `sys.modules`）。
  - httpx client base_url=`os.environ.get("BACKEND_URL","http://127.0.0.1:8011")`，合理超时；连不上回明确「后端不可达」文字。
  - 密钥从 env、fail-closed（缺则回明确错误，不发空头）；日志走 stderr，无 `print`。
- **Threshold**: 80
