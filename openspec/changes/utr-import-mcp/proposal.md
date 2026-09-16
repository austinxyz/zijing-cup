---
Date: 2026-09-15
Change: utr-import-mcp
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-09-15-utr-import-mcp-requirements.md
---

## Why

抓完某队某组的 UTR 后,现在要手过「写 `current-utr.csv` → 再导入」。一个本地 MCP 让本机 agent
抓完直接把整队一批 UTR 写进 app,省掉 CSV 中间步。

## What Changes

- 新增本地 stdio MCP server(`backend/app/mcp_server.py`),官方 `mcp` Python SDK + `httpx`,
  **只走 HTTP 打本地 FastAPI**,不 import `app.db`、不碰数据库。
- 两个工具,薄包现有端点:
  - `read_team_utr_sheet(season, division, team)` → `GET .../utr-sheet`(回每人 player_id + 现 UTR + profile id)。
  - `write_team_current_utr(season, division, team, updates, season_year?)` → `PUT /api/players/current-utr`
    (按 player_id 批量、全有或全无、传 season_year 时 rated 双打 mirror 进参赛 UTR)。
- 匹配在 agent 侧:MCP 不做姓名/profile 匹配,读工具给 player_id,agent 对号后按 id 写。
- 鉴权走共享密钥(env:`BACKEND_URL`/`BACKEND_SECRET`/`ADMIN_SECRET`);`.mcp.json` 注册。
- 不加新后端端点、不改被包端点语义。

## Capabilities

### New Capabilities

- `utr-import-mcp` — 本地 stdio MCP,把某队某组的一批当前 UTR 写进 app:两工具(读该队 sheet 拿 player_id、
  按 id 批量写当前 UTR)包现有端点;只走 HTTP 不碰 DB;匹配在 agent 侧;共享密钥鉴权;错误透传。

### Modified Capabilities

<none — 本 change 只从 MCP 侧**调用** `current-utr-io` 的既有端点(`PUT /players/current-utr`、
`GET .../utr-sheet`),不改它们的需求/行为;mirror 与赛季锁语义原样复用。>

## Impact

- **后端(新增,非 API)**:`backend/app/mcp_server.py`(stdio MCP,`httpx` client);`backend/pyproject.toml`
  加 `mcp` 依赖(装进 `.venv-std`)。**不新增 FastAPI 路由、不改 `app/db.py`。**
- **配置**:仓库加一份 `.mcp.json`(或示例),用 env 引用密钥,不含明文;`BACKEND_URL` 默认 `127.0.0.1:8011`。
- **测试**:`backend/tests/test_mcp_server.py`——httpx `MockTransport` 拦请求,断言路径/头/体 + 错误透传 +
  「import MCP 不触发 DB 连接」守卫。
- **无 migration、无前端、无远程前置。**

## Out of Scope

- 服务端姓名/profile 匹配(方案 A/B)——本 change 匹配在 agent 侧。
- 抓取(仍由 `update-doubles-utr` skill / 浏览器);preview/diff 工具;发现工具(`list_teams`)。
- 远程/托管 MCP、外部访问;仅本机 stdio。
- 参赛 UTR 直接写(`set_season_utr`);参赛 UTR 只经既有 mirror 间接更新。
