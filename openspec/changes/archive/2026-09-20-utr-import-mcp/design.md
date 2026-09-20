## Context

两个写/读端点已存在(`GET .../utr-sheet`、`PUT /api/players/current-utr`,见 `backend/app/routers/utr.py`),
且各自有测试与 mirror/赛季锁语义。本 change 只加一个本地 stdio MCP,把这两个端点暴露成 agent 工具,
省掉抓完 UTR 后手过 CSV 的中间步。架构铁律:只有 FastAPI 碰 DB——所以 MCP 走 HTTP,不 import `app.db`。

## Goals / Non-Goals

**Goals:** 本地 stdio MCP(`mcp` SDK + httpx)两工具包现有端点;匹配在 agent 侧(只认 player_id);
共享密钥从 env、fail-closed;错误透传;不碰 DB、不加端点、不改被包语义。
**Non-Goals:** 服务端匹配、抓取、preview/diff、发现工具、远程 MCP、参赛 UTR 直写。

## Decisions

- **D1 形态/位置**:`backend/app/mcp_server.py`,官方 `mcp` Python SDK。倾向 `FastMCP`(声明式、少样板);
  按装到 `.venv-std` 的实际版本定,不行就退 low-level `Server`。跑法
  `backend/.venv-std/Scripts/python.exe -m app.mcp_server`(签名解释器绕 Application Control,CLAUDE.md)。
- **D2 只走 HTTP**:module 级建一个 `httpx.Client`(或每调一次建),base_url = `os.environ.get("BACKEND_URL",
  "http://127.0.0.1:8011")`。**绝不 import `app.db`/SQLModel**;守卫测试断言 import `app.mcp_server` 不触发
  DB 连接(可用 monkeypatch/`sys.modules` 检查,或断言没 import `app.db`)。
- **D3 两工具**:
  - `read_team_utr_sheet(season, division, team)` → `GET /api/seasons/{season}/divisions/{division}/teams/
    {team}/utr-sheet`,头 `X-Backend-Secret`。回 JSON 行(透传 SheetRowOut 结构)。
  - `write_team_current_utr(season, division, team, updates, season_year=None)` → `PUT /api/players/current-utr`,
    头 `X-Backend-Secret`+`X-Admin-Secret`,体 `{updates, season_year}`。`season`/`division`/`team` 收在工具签名里
    是给 agent 的语境/校验用(端点本身按 player_id 全局写,不需要路径里的队)——**只把 updates+season_year
    发给端点**。`updates` 逐条只带被显式给的字段(保 `exclude_unset` 的「省略=不动」),显式 `null` 才清值。
- **D4 密钥/配置**:`BACKEND_SECRET`(读写)、`ADMIN_SECRET`(写)从 env 读;取不到就 raise/回明确错误文字
  (fail-closed,不发空头)。仓库放 `.mcp.json`(或 `.mcp.json.example`)用 `${BACKEND_SECRET}` 之类 env 引用,
  不含明文。
- **D5 错误透传**:httpx 响应非 2xx 时,取 body 的 `detail` 原样放进工具的返回(或抛成 MCP 工具错误带该文字),
  别吞成「请求失败」。让 agent 能读「unknown player ids: [...]」「season X is locked」并改正。
- **D6 singles 可选**:工具入参支持 singles_utr/status(端点支持),主用途双打;singles 顺带能写。

## Risks / Trade-offs

- **[stdout 污染 MCP 协议]** → 日志一律 stderr;新代码无 `print`。
- **[后端没起 / 冷启动]** → httpx 设合理超时;连不上回明确「后端未运行/不可达」错误文字,不是裸 traceback。
- **[误把整列对错一位]** → 端点已是全有或全无;工具不额外「尽力写一半」。匹配错是 agent 侧的事(方案 C),
  读工具给的 player_id 是唯一 key,agent 对号错→写错人,靠端点回的写入条数 + agent 事后再读自查。
- **[`.venv-std` 缺 mcp/httpx]** → apply 时装进 `.venv-std`;`pyproject.toml`/CI 以 uv 为准(本机绕行既有约定)。
- **[单测依赖活服务]** → 用 httpx `MockTransport` 拦截,断言 URL/头/体 + 错误透传,不依赖真后端;可选真机冒烟。

## Migration Plan

无 migration、无部署面变更(纯本机工具)。装依赖:`.venv-std` 加 `mcp`+`httpx`(httpx 可能已在)。
注册:把 `.mcp.json` 指向 `backend/.venv-std/Scripts/python.exe -m app.mcp_server`。回滚:删 `.mcp.json` 条目即可,
后端/前端不受影响。

## Open Questions

- `mcp` SDK 版本与 server 风格(`FastMCP` vs low-level)——apply 时按实际装到 `.venv-std` 的版本定。
- 单测用 `MockTransport`(倾向)还是打活后端——倾向 MockTransport + 一条可选真机冒烟。
- `.mcp.json` 提交真文件还是 `.example`——倾向 `.example`(避免把本机路径/env 名固化;真文件本机私有)。
