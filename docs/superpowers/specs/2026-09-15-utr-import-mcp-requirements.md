---
Date: 2026-09-15
Change: utr-import-mcp
Status: REVIEWED
HAS_UI_SURFACE: no
---

# utr-import-mcp — 本地 MCP:批量导入某队某组的 UTR

一个本地 stdio MCP server,让 Claude Code(本机 agent)在从 utrsports.net 抓完某队的 UTR 后,
直接把整队一批 UTR 写进 app——省掉现在「抓 → 写 `current-utr.csv` → 再导入」里的 CSV 中间步。
MCP 只是薄包装:它**只走 HTTP 打本地 FastAPI**(带共享密钥),绝不直连数据库,架构边界不破。
两个工具:读该队现值(拿到 `player_id`)、按 `player_id` 批量写当前 UTR。对号入座由 agent 在两步之间做。

## Goals

1. **本地 MCP server(stdio)。** 用官方 `mcp` Python SDK,放在 `backend/`(如 `backend/app/mcp_server.py`),
   跑法 `backend/.venv-std/Scripts/python.exe -m app.mcp_server`,在 `.mcp.json` 注册给 Claude Code。
   只走 HTTP 打本地 FastAPI(`httpx`),**不 import `app.db`、不碰数据库**。
2. **两个工具,包现有端点:**
   - `read_team_utr_sheet(season, division, team)` → 包 `GET /api/seasons/{year}/divisions/{code}/teams/{team_code}/utr-sheet`,
     回该队每人 `{player_id, last_name, first_name, singles_utr, singles_status, doubles_utr, doubles_status, utr_profile_id}`。
     agent 用它拿到 `player_id`(和现值 / profile id),把抓来的值对到人。
   - `write_team_current_utr(season, division, team, updates, season_year?)` → 包 `PUT /api/players/current-utr`,
     `updates` 是 `[{player_id, doubles_utr?, doubles_status?, singles_utr?, singles_status?, utr_profile_id?}]`。
     **全有或全无**(端点本身如此);传 `season_year` 且该赛季开放时,rated 的当前双打 UTR 会 mirror 进参赛 UTR
     (端点既有语义,`_NON_MIRRORING_STATUSES` 与赛季锁照旧生效)。
3. **匹配在 agent 侧(方案 C)。** MCP 不做姓名/profile 匹配;读工具给出 `player_id`,agent 负责把抓到的
   值对到 `player_id` 再调写工具。后端只认 `player_id`(未知 id → 422,整批不写)。
4. **鉴权靠共享密钥。** MCP 从环境读 `BACKEND_URL`(默认 `http://127.0.0.1:8011`)、`BACKEND_SECRET`、
   `ADMIN_SECRET`,写请求带 `X-Backend-Secret` + `X-Admin-Secret`(写方法由后端中间件按 HTTP 方法拦)。
   密钥只在本机环境,不进仓库、不进聊天。
5. **错误透传成 agent 能读的文字。** 后端 4xx/5xx 的 `detail`(如 `unknown player ids: [...]`、
   `season 2025 is locked`、404 team not found)原样带回工具结果,agent 能据此改正重试。

## Non-Goals

- 不做姓名/profile 的服务端匹配(那是方案 A/B,本 change 明确选 C:匹配在 agent 侧)。
- 不做抓取——MCP 不碰 utrsports.net;抓 UTR 仍由现有 `update-doubles-utr` skill / 浏览器做。
- 不做 preview/diff 工具(`apply_sheet` 那套 CSV diff 不在本 change;要看差异 agent 可先读 sheet 自比)。
- 不做发现工具(`list_teams` 等);队码/组码由 agent 已知或从别处拿。
- 不加新后端端点、不改 `PUT /players/current-utr` 与 utr-sheet 的语义——MCP 纯包装。
- 不做远程/托管 MCP、不开放外部访问;仅本机 stdio。
- 不碰参赛 UTR 的直接写(`set_season_utr`);参赛 UTR 只经既有 mirror 语义间接更新。

## Constraints

- **架构不可违反:** MCP 只与本地 FastAPI 通信(HTTP),只有 FastAPI 访问 DB。MCP **禁止** import
  `app.db` / SQLModel / 直连 Postgres。
- **本机 Application Control:** 用 `backend/.venv-std/Scripts/python.exe`(签名解释器)跑,别用 uv/venv
  trampoline(`os error 4551`)。`mcp` 与 `httpx` 装进 `.venv-std`。
- **密钥:** `BACKEND_SECRET`/`ADMIN_SECRET` 从 env 读,fail-closed(缺了就报「未配置」而不是发空头);
  绝不硬编码、不写进 `.mcp.json` 的明文(用 env 引用)、不进仓库。
- **写是全有或全无:** 复用端点的批量事务语义;一条坏(未知 id / 解析失败)整批回滚。
- **清空 vs 不动:** 端点用 `exclude_unset` 区分「设为 null(清值)」与「不传(保持)」。工具的入参
  schema 要保住这个区别——省略字段 = 不动,显式 `null` = 清空(与 CLAUDE.md「清空发 null 不发空串」一致)。
- 新代码无 `print`(用 logging;MCP stdio 下 stdout 是协议通道,日志必须走 stderr)。

## Success Criteria

1. `read_team_utr_sheet` 对已知队回正确行(含 `player_id` 与现 UTR / profile id);未知队透传 404。
2. `write_team_current_utr` 按 `player_id` 批量写当前 UTR;传 `season_year` 且赛季开放时 rated 双打 mirror
   进参赛 UTR,projected/unrated 不 mirror,赛季锁则一律不 mirror(端点既有行为,工具透传)。
3. 未知 `player_id` → 整批不写、错误文字带回;缺 `BACKEND_SECRET`/`ADMIN_SECRET` → 工具明确报未配置。
4. MCP 全程不 import `app.db`(可用一条断言/测试守住:import `app.mcp_server` 不触发 DB 连接)。
5. 工具函数有单测(httpx mock 或打一个测试后端),覆盖:读成功、读 404 透传、写成功、未知 id 422 透传、
   缺密钥报错、`exclude_unset`(省略=不动 / null=清空)。
6. `.mcp.json` 注册后,Claude Code 能列出并调用两个工具;一次真机演练:读某队 sheet → 改几个 doubles UTR →
   写回 → 再读确认落库(本地栈,虚构或测试数据)。

## User Stories

- 作为本机 operator,我用浏览器/skill 抓完某队某组的当前双打 UTR 后,让 agent 调 `read_team_utr_sheet`
  拿到这队的 `player_id` 与现值,把抓到的数按人对上,再 `write_team_current_utr` 一次写回,不再手过 CSV。
- 作为 operator,我传错了一个 `player_id`,整批不写、工具回「unknown player ids: [...]」,我改完重试。
- 作为 operator,赛季还没锁时导入当前双打 UTR,它同时更新了参赛 UTR(mirror);锁季后再导入只改当前值、
  不动冻结的参赛 UTR。

## Open Questions

- `mcp` Python SDK 的具体版本 / server 风格(low-level `Server` vs `FastMCP`)——apply 时按装到 `.venv-std`
  的实际版本定;倾向 `FastMCP`(声明式、少样板)。
- 工具是否也暴露 singles UTR(端点支持)。倾向**支持但可选**:主用途是双打,singles 顺带能写,省一个来回。
- 单测怎么起测试后端:是打一个已跑的本地 FastAPI,还是用 httpx `MockTransport` 拦截。倾向 `MockTransport`
  (不依赖活服务、可断言请求头/体),再加一条可选的真机冒烟。

## Referenced Capabilities

- `current-utr-io`(被包装:`PUT /players/current-utr` 批量写 + mirror 语义、`GET .../utr-sheet` 导出;
  本 change 不改其行为,只从 MCP 侧调用)
- `admin-credentials` / `admin-access`(共享密钥 + 按方法判权;MCP 作为写调用方持 `X-Admin-Secret`)
- `player-registry`(`player_id` 是匹配 key;utr-sheet 的行来自队 roster)
