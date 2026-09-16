## 1. MCP server 骨架 + read_team_utr_sheet + 不碰 DB + 密钥 fail-closed

### Contract
- **Spec**:
  - 系统 SHALL 提供一个本地 stdio MCP server（`backend/app/mcp_server.py`，官方 `mcp` SDK）。它 SHALL 只通过 HTTP（`httpx`）调用本地 FastAPI，MUST NOT import `app.db`、MUST NOT 直连数据库。`BACKEND_URL` 从环境读（默认 `http://127.0.0.1:8011`）。日志 MUST 走 stderr。
  - 系统 SHALL 暴露工具 `read_team_utr_sheet(season, division, team)`，包 `GET /api/seasons/{season}/divisions/{division}/teams/{team}/utr-sheet`，回该队每人 `{player_id, last_name, first_name, singles_utr, singles_status, doubles_utr, doubles_status, utr_profile_id}`。读 SHALL 带 `X-Backend-Secret`。未知队 SHALL 把后端 404 透传成工具错误。
  - MCP SHALL 从环境读 `BACKEND_SECRET`（读写都要），缺失时 SHALL 明确报「未配置」而不是发空头。密钥 MUST NOT 硬编码/明文进仓库。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_mcp_server.py -q` → expected: 读工具用例全过（httpx MockTransport 断言 GET 路径+`X-Backend-Secret` 头、正常回行、404 透传、缺 BACKEND_SECRET 报未配置、import 不触发 DB）。
- **Code**:
  - `FastMCP`（倾向）或 low-level `Server`，按 `.venv-std` 装到的 `mcp` 版本定；跑法 `.venv-std python -m app.mcp_server`。
  - **绝不 import `app.db`/SQLModel**；配守卫测试（import `app.mcp_server` 不建 DB 连接 / 不 import `app.db`）。
  - `httpx.Client(base_url=os.environ.get("BACKEND_URL","http://127.0.0.1:8011"))`，合理超时；连不上回明确「后端不可达」文字。
  - 密钥从 env、fail-closed（缺则 raise/回明确错误，不发空头）；日志走 stderr，无 `print`。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/utr-import-mcp/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — write failing pytest: import `app.mcp_server` 不触发 DB（不 import `app.db` / 无连接）；`read_team_utr_sheet` 对 MockTransport 发 `GET /api/seasons/{s}/divisions/{d}/teams/{t}/utr-sheet` 带 `X-Backend-Secret`，回行透传
- [ ] 1.2 GREEN — 建 `backend/app/mcp_server.py`：MCP server + httpx client（BACKEND_URL/BACKEND_SECRET from env，fail-closed）+ `read_team_utr_sheet` 工具；装 `mcp`(+`httpx`) 进 `.venv-std`
- [ ] 1.3 RED — write failing pytest: 后端 404 → 工具带回「team not found」不抛裸异常；缺 `BACKEND_SECRET` → 报「未配置」且不发请求
- [ ] 1.4 GREEN — 加 404/错误透传 + 缺密钥 fail-closed 分支
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. write_team_current_utr（按 id 批量写 + exclude_unset + 错误透传）

### Contract
- **Spec**:
  - 系统 SHALL 暴露工具 `write_team_current_utr(season, division, team, updates, season_year?)`，包 `PUT /api/players/current-utr`。`updates` 为 `[{player_id, doubles_utr?, doubles_status?, singles_utr?, singles_status?, utr_profile_id?}]`。写 SHALL 带 `X-Backend-Secret` + `X-Admin-Secret`。写 SHALL 全有或全无。传 `season_year` 时后端既有 mirror 语义原样生效，本工具 MUST NOT 复制或改写该逻辑。省略字段 SHALL 表示「不动」、显式 `null` SHALL 表示「清空」（经 `exclude_unset`）。
  - MCP SHALL 从环境读 `ADMIN_SECRET`（写要），缺失时明确报「未配置」。后端 4xx/5xx 的 `detail` SHALL 原样带回。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_mcp_server.py -q` → expected: 写工具用例全过（MockTransport 断言 `PUT /api/players/current-utr`、两个头、体 `{updates, season_year}`；未知 id 422 透传；省略=不发该字段 / null=发 null；缺 ADMIN_SECRET 报未配置）。
- **Code**:
  - 只把 `updates`+`season_year` 发给端点（`season/division/team` 是工具语境/校验用，端点按 player_id 全局写）。
  - 逐条 update 只带被显式给的字段（保 `exclude_unset` 的「省略=不动」）；显式 `null` 才进 body 清值。
  - 写头加 `X-Admin-Secret`（env，fail-closed）；非 2xx 取 body `detail` 原样带回（含「unknown player ids」「season X is locked」），不吞成「请求失败」。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/utr-import-mcp/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — write failing pytest: `write_team_current_utr` 对 MockTransport 发 `PUT /api/players/current-utr` 带 `X-Backend-Secret`+`X-Admin-Secret`、体含 `updates` 与 `season_year`；成功回写入条数
- [ ] 2.2 GREEN — 实现写工具（组 body、两头、发端点、回结果）
- [ ] 2.3 RED — write failing pytest: 未知 id → 后端 422 透传「unknown player ids: [...]」；一条 update 省略 singles、显式 `doubles_utr: null` → body 里无 singles 键、doubles 为 null；缺 `ADMIN_SECRET` → 报未配置不发请求
- [ ] 2.4 GREEN — 加 exclude_unset 组 body（省略不进 body、null 进 body）+ 错误透传 + admin 密钥 fail-closed
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证 + 注册 + 交付

- [ ] 3.1 Run backend test suite — `backend/.venv-std/Scripts/python.exe -m pytest -q`（先跑测试，再补种——CLAUDE.md）；确认无回归
- [ ] 3.2 前端无改动——跳过 vitest（本 change 不碰前端）
- [ ] 3.3 `.mcp.json.example` — 写一份示例（`command`=`backend/.venv-std/Scripts/python.exe`、`args`=`["-m","app.mcp_server"]`、`cwd`=backend、env 用 `${BACKEND_SECRET}`/`${ADMIN_SECRET}`/`BACKEND_URL` 引用，不含明文）；真机冒烟：起本地后端 → 注册 `.mcp.json` → 让 Claude Code 列出/调 `read_team_utr_sheet` 读某队 → 改几个 doubles UTR → `write_team_current_utr` 写回 → 再读确认落库（本地栈、虚构/测试数据）；测完删测试数据
- [ ] 3.4 Run superpowers:verification-before-completion — 跑 `.venv-std pytest`；`grep -rn 'print(' backend/app/mcp_server.py` 应空（日志走 stderr）；确认 `app/mcp_server.py` 不 import `app.db`；无 migration、无远程前置
