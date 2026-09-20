## Purpose

一个本地 stdio MCP server,让本机 agent 抓完某队某组的 UTR 后,直接把整队一批当前 UTR 写进 app——
省掉手过 CSV 的中间步。薄包现有端点、只走 HTTP 不碰 DB,匹配在 agent 侧。

## ADDED Requirements

### Requirement: 本地 stdio MCP server,只经 HTTP 调后端

系统 SHALL 提供一个本地 stdio MCP server(`backend/app/mcp_server.py`,官方 `mcp` SDK)。它 SHALL 只通过
HTTP(`httpx`)调用本地 FastAPI,MUST NOT import `app.db`、MUST NOT 直连数据库。`BACKEND_URL` 从环境读
(默认 `http://127.0.0.1:8011`)。日志 MUST 走 stderr(stdout 是 MCP 协议通道)。

#### Scenario: 不碰数据库
- **WHEN** import `app.mcp_server`
- **THEN** 不建立任何数据库连接、不 import `app.db`(可用测试/断言守住)

#### Scenario: 后端地址可配
- **WHEN** 设了 `BACKEND_URL`
- **THEN** 工具请求打该地址;未设时打 `http://127.0.0.1:8011`

### Requirement: 工具 read_team_utr_sheet 读该队现值与 player_id

系统 SHALL 暴露工具 `read_team_utr_sheet(season, division, team)`,包 `GET /api/seasons/{season}/divisions/
{division}/teams/{team}/utr-sheet`,回该队每人 `{player_id, last_name, first_name, singles_utr, singles_status,
doubles_utr, doubles_status, utr_profile_id}`。读 SHALL 带 `X-Backend-Secret`。未知队 SHALL 把后端 404 透传成
工具错误。

#### Scenario: 读到该队每人 id 与现值
- **WHEN** 对一支已知队调用
- **THEN** 回该队所有人的 player_id + 现 UTR(供 agent 对号)

#### Scenario: 未知队透传 404
- **WHEN** team/division/season 对不上任何队
- **THEN** 工具结果带回后端的 404「team not found」,不抛裸异常

### Requirement: 工具 write_team_current_utr 按 player_id 批量写当前 UTR

系统 SHALL 暴露工具 `write_team_current_utr(season, division, team, updates, season_year?)`,包
`PUT /api/players/current-utr`。`updates` 为 `[{player_id, doubles_utr?, doubles_status?, singles_utr?,
singles_status?, utr_profile_id?}]`。写 SHALL 带 `X-Backend-Secret` + `X-Admin-Secret`。写 SHALL 全有或全无
(端点既有事务语义)。传 `season_year` 时,后端既有 mirror 语义原样生效(rated 双打 → 参赛 UTR;
projected/unrated 或赛季锁则不 mirror)——本工具 MUST NOT 复制或改写该逻辑。省略某字段 SHALL 表示「不动」、
显式 `null` SHALL 表示「清空」(经端点的 `exclude_unset`)。

#### Scenario: 按 id 批量写成功
- **WHEN** updates 全是已知 player_id
- **THEN** 整批写入,回写入条数

#### Scenario: 未知 id 整批不写并透传
- **WHEN** updates 含未知 player_id
- **THEN** 后端 422、整批回滚,工具带回「unknown player ids: [...]」

#### Scenario: 传 season_year 触发既有 mirror
- **WHEN** 赛季开放且某人 rated 双打 UTR 随 `season_year` 一起写
- **THEN** 该值按端点既有语义 mirror 进该赛季参赛 UTR(projected/unrated 或锁季不 mirror)

#### Scenario: 省略 vs null
- **WHEN** 一条 update 省略 `singles_utr` 而显式给 `doubles_utr: null`
- **THEN** singles 不动、doubles 被清空(经 `exclude_unset`)

### Requirement: 共享密钥从环境读,fail-closed

MCP SHALL 从环境读 `BACKEND_SECRET`(读写都要)与 `ADMIN_SECRET`(写要),缺失时 SHALL 明确报「未配置」
而不是发空头去撞后端 4xx。密钥 MUST NOT 硬编码、MUST NOT 以明文进仓库或 `.mcp.json`。

#### Scenario: 缺密钥明确报错
- **WHEN** 调写工具但 `ADMIN_SECRET` 未设
- **THEN** 工具回「ADMIN_SECRET 未配置」,不发请求

#### Scenario: 后端错误文字透传
- **WHEN** 后端回 4xx/5xx(如赛季锁、未知 id)
- **THEN** 其 `detail` 原样带回工具结果,供 agent 改正重试
