---
Date: 2026-09-04
Change: player-win-loss
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-09-04-player-win-loss-requirements.md
---

## Why

组委会导出的 current-utr CSV 已经带 `总场次/胜/负/胜率`，但系统没读，队伍页看不到任何
胜负战绩。队长想据此判断谁状态好。这些列就在已有的导入格式里，接上即可。

## What Changes

- **`players` 加 `wins`/`losses`**（可空 int，生涯值、跨赛季、最新导入为准）。总场次与
  胜率不入库——分别是 `胜+负` 与 `胜/(胜+负)` 的派生量。
- **UTR sheet 导入读胜/负**：解析器按位置多读第 9、10 列（`胜`/`负`，0 基），`总场次`
  (8) 与 `胜率`(11) 忽略；胜/负进导入**预览 diff**（能看到改动、防整列错位）、随全有或
  全无写入落库。空单元格=不动。
- **team-roster 响应带 `wins`/`losses`**，前端类型收进 `RosterPlayer`。
- **队伍页只读花名册加「胜率」列**：`胜-负`(如 `67-20`) + 百分比(如 `77%`)，缺失显示
  `—`；桌面表 + 手机卡片都显示。

## Capabilities

### New Capabilities

（无——修改三个既有能力 + 一处新 schema 列。）

### Modified Capabilities

- `player-registry` — 队员带生涯 `wins`/`losses`（`players` 两列 + migration，可空）。
- `current-utr-io` — CSV 导入多读 `胜`/`负`两列写进队员战绩（解析 `SheetRow`、预览 diff
  `PlayerView` + 字段计数、apply 写入）；`总场次`/`胜率`忽略；空格=不动。
- `team-roster` — `RosterPlayerOut` + `get_team_roster` 带出 `wins`/`losses`。
- `team-roster-ui` — 只读花名册（`RosterTable` 桌面表 + 手机卡片）加胜率列。

## Impact

- **Schema / migration**：`players.wins int null`、`players.losses int null`。migration 是
  唯一来源；远程 Dashboard 手工执行、本地打 127.0.0.1（禁 CLI push）。
- **后端**：`app/models/players.py`（Player 加两列）；`app/players/utr_sheet.py`
  （`SheetRow`/`PlayerView` 加 wins/losses、`_row_from_cells` 读第 9/10 列、diff FIELDS +
  计数）；apply 写入路径（`app/routers/utr.py` 的 sheet apply / current-utr 写）；
  `app/rosters/query.py`（`RosterPlayerOut` + `get_team_roster`）。
- **前端**：`lib/api.ts`（`RosterPlayer` 加 `wins`/`losses`）；`teams/[code]/RosterTable.tsx`
  （桌面表 + 手机卡片加胜率列）。

## Out of Scope

- 编辑模式手改胜负（导入是唯一入口）。
- 逐场明细、按赛季快照胜负。
- 改 UTR 值/状态/外援/学校等既有导入字段语义。
- 阵容/排阵不使用胜率（不进引擎，只是队伍页信息）。
