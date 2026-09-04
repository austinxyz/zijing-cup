---
Date: 2026-09-04
Change: player-win-loss
Status: REVIEWED
HAS_UI_SURFACE: no
---

# player-win-loss — 队员胜率（胜/负场次 + 百分比），CSV 导入

队伍页现在看不到队员的胜负战绩。组委会导出的 current-utr CSV 已经带了 `总场次/胜/负/
胜率` 列，只是系统没读。这个 change 把胜/负存进队员、经现有 UTR 导入屏灌入、在队伍页
只读花名册显示一列胜率。

## Goals

1. **存储（按队员，生涯值）。** `players` 新增 `wins`、`losses`（可空 int）。跨赛季、
   最新一次导入为准；总场次 = 胜 + 负、胜率由 `胜 / (胜 + 负)` 计算，都不单独存
   （CSV 里的 `总场次`/`胜率` 是派生列，导入时忽略）。
2. **CSV 导入（走现有 UTR sheet 导入）。** current-utr CSV 已是导入屏认的格式，只是多了
   末尾 `总场次,胜,负,胜率` 四列（表头第 9-12 列，0 基索引 8-11）。解析器按位置多读
   `胜`(索引 9)、`负`(索引 10) 写进 `wins`/`losses`；`总场次`/`胜率` 忽略。这两个字段
   进导入的**预览 diff**（和 UTR 值一样，能在写入前看到改了什么、防整列错位），全有或
   全无写入不变。空单元格 = 不动；`-` 之类清空语义沿用既有约定。
3. **显示。** 队伍页只读花名册加一列「胜率」：显示 `胜-负`（如 `67-20`）与百分比
   （如 `77%`）。胜/负缺失（从未导入）显示 `—`。桌面表 + 手机卡片都显示。

## Non-Goals

- N/A (bounded) —— 不在编辑模式手改胜负（导入是唯一入口）；不做逐场明细、不做按赛季
  快照、不改 UTR 值/状态/外援等既有导入字段的语义。

## Constraints

- 架构不变：浏览器→Next→FastAPI→DB；只有 FastAPI 访问库；写鉴权按方法判。
- `zijing_cup` schema；migration 是 schema 变更唯一来源；远程共享库不跑 CLI push，
  改动去 Dashboard 手工执行、本地打 127.0.0.1。
- 数字全程整数；胜率是**显示派生**（前端算 `胜/(胜+负)`），不入库、不做数值比较陷阱。
- CSV 表头不在第 1 行的既有约定（`HEADER_SEARCH_LIMIT`）不受影响——本 CSV 第一行就是
  表头（`id,姓,名,…`），沿用现有解析。

## Success Criteria

1. `players` 有 `wins`/`losses`，可空、默认 null（≠0：null=从未导入，0=真的 0 胜）。
2. 导入 current-utr CSV（带 `总场次,胜,负,胜率`）后，对应队员 `wins`/`losses` 落库；
   预览 diff 能显示胜/负的改动；一条坏行整批回滚不变。
3. 队伍页只读花名册显示「胜率」列：`胜-负` + `%`；缺失显示 `—`；桌面 + 375 均显示、
   不横向溢出（撑不下走既有横滚容器）。
4. `wins`/`losses` 出现在 team-roster 响应里，前端类型收进 `RosterPlayer`。
5. 后端 + 前端测试覆盖：解析读到胜/负、apply 写库、diff 计数、显示列、缺失显示 —；
   `npx tsc --noEmit` 干净。

## User Stories

- 作为队长，我把组委会那份 current-utr CSV 从队伍页的 UTR 导入屏导进来，队员列表上
  就能看到每个人的胜-负和胜率，判断谁状态好。

## Open Questions

（无——存储按队员、走现有导入屏、胜率显示派生，均已定。CSV 的 `总场次`/`胜率` 列忽略、
只读 `胜`/`负`。）

## Referenced Capabilities

- `player-registry`（修改）：`players.wins`/`losses` 字段 + migration；UTR sheet 解析
  （`SheetRow`）、diff（`PlayerView` + 字段计数）、apply 写入扩到胜/负。
- `team-roster`（修改）：`RosterPlayerOut` + `get_team_roster` 带出 `wins`/`losses`。
- `team-roster-ui`（修改）：只读花名册（`RosterTable` 桌面表 + 手机卡片）加胜率列。
