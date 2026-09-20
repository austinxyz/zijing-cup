## Contract — Group 2: write_team_current_utr（按 id 批量写 + exclude_unset + 错误透传）

- **Spec**:
  - 系统 SHALL 暴露工具 `write_team_current_utr(season, division, team, updates, season_year?)`，包 `PUT /api/players/current-utr`。`updates` 为 `[{player_id, doubles_utr?, doubles_status?, singles_utr?, singles_status?, utr_profile_id?}]`。写 SHALL 带 `X-Backend-Secret` + `X-Admin-Secret`。写 SHALL 全有或全无。传 `season_year` 时后端既有 mirror 语义原样生效，本工具 MUST NOT 复制或改写该逻辑。省略字段 SHALL 表示「不动」、显式 `null` SHALL 表示「清空」（经 `exclude_unset`）。
  - MCP SHALL 从环境读 `ADMIN_SECRET`（写要），缺失时明确报「未配置」。后端 4xx/5xx 的 `detail` SHALL 原样带回。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_mcp_server.py -q` → expected: 写工具用例全过（MockTransport 断言 `PUT /api/players/current-utr`、两个头、体 `{updates, season_year}`；未知 id 422 透传；省略=不发该字段 / null=发 null；缺 ADMIN_SECRET 报未配置）。
- **Code**:
  - 只把 `updates`+`season_year` 发给端点（`season/division/team` 是工具语境/校验用，端点按 player_id 全局写）。
  - 逐条 update 只带被显式给的字段（保 `exclude_unset` 的「省略=不动」）；显式 `null` 才进 body 清值。
  - 写头加 `X-Admin-Secret`（env，fail-closed）；非 2xx 取 body `detail` 原样带回（含「unknown player ids」「season X is locked」），不吞成「请求失败」。
- **Threshold**: 80
