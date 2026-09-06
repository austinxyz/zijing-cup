---
Date: 2026-09-05
Change: player-admin-workbench
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-05-player-admin-workbench-requirements.md
---

## Why

队员管理页现是单栏列表 + 独立详情路由，且整个板块被 `canEdit` gate——非编辑者根本进不去，
而队员数据本就在名单页公开。改成与队伍/阵容页一致的查看/编辑双模式（任人可读、编辑才 gate），
并重排为左搜索右详情的双栏工作台，让找人 + 看详情 + 就地改在一屏内完成。

## What Changes

- **查看/编辑双模式**：页头加「编辑模式 / 查看模式」开关（复用 `EditModeToggle` 就地解锁，带
  season/division）。**去掉 `players/layout.tsx` 的 `canEdit` 重定向** —— 任何人可只读进入；写权按
  `canEdit(season, division)` 判。查看模式隐藏所有写动作（改字段/裁决/合并/拆分入口全隐）。
- **双栏工作台**：左栏搜索（姓名/性别/所在队伍模糊/参赛年份）+ 结果列表（姓名·性别·最新参赛UTR·
  所在队伍）；右栏选中队员详情。选中经 URL `?sel=<id>` 软导航，左栏搜索/滚动不丢。
- **右栏详情**：复用现有详情内容（资料/UTR链接、各赛季参赛UTR+来源+未裁决、所在队伍只读表）；编辑
  模式下可改字段、裁决、合并、拆分（沿用现有端点与不可逆确认）。
- **后端 `list_players` / `count_players` 加筛选参数**：`gender`（精确）、`team`（模糊 ilike
  `Team.code` + `Team.display_name`）、`year`（该年有 `PlayerSeasonUtr` **或** 该年在 `Team` 名单，
  任一）。保留现有 `q`/`season`/`team_id`/`unresolved`。
- 移动端：双栏堆叠为「列表 → 详情（可返回）」两屏。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- **player-admin-ui** —— 页面从单栏 + 独立详情改为查看/编辑双模式的左右双栏工作台；查看权从「整页
  gate」改为「任人可读、编辑 gate」；多字段搜索 + 就地详情。
- **player-registry** —— `list_players`/`count_players` 查询新增 `gender`、`team`（模糊）、`year`
  （参赛年或名单年任一）三个筛选维度。

## Impact

- 前端：`app/[season]/[division]/players/`（`page.tsx` 重排双栏 + 搜索；`layout.tsx` 去 canEdit
  重定向；新增左栏搜索/结果列表组件、右栏详情组件、编辑/查看模式上下文；`players/[id]` 详情内容
  抽成可在右栏复用；`merge`/`split` 子路由入口从右栏进）。
- 前端：`lib/api.ts` 的 `PlayerFilters`/`PlayerPageFilters` 加 `gender`/`team`/`year`。
- 后端：`app/players/query.py` 的 `_filtered`/`list_players`/`count_players` 加参数；`app/routers/
  players.py` 列表路由收新 query 参数。
- 无新表、无 migration、无鉴权改动（仍共享密钥 + 按方法判权 + 按比赛 scope 前端判）。

## Out of Scope

- **队伍页加/移出队员**（`add_membership`/`remove_membership` 后端已就绪、缺前端）—— 归后续 change
  `team-add-remove-player`（属 team-roster-ui），本 change 右栏详情的所在队伍只读。
- 不做实时 UTR 同步、不改参赛 UTR 冻结/覆盖语义、不动未裁决队列逻辑。
