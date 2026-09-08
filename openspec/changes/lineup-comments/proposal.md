---
Date: 2026-09-07
Change: lineup-comments
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-07-lineup-comments-requirements.md
---

## Why

球员评价（`player-notes`）让队员能记 note；阵容也该能记评论——「这套打谁用、为什么这么排、注意哪条线」。
给已存阵容加追加式评论，与 notes 对称。已存阵容本就是管理员机密，评论天然同门。

## What Changes

- 新表 `lineup_comments`（挂 `saved_lineups`，纯自由文本、追加式、可删、不就地编辑）+ GET/POST/DELETE +
  批量读端点（按 saved_lineup id 分组，对称 notes 批量端点）。
- 已存阵容卡片底部加可展开「评论 N ▾」区：倒序时间线 +（编辑模式）追加框 + 就地确认删除；查看模式只读；
  能看到已存阵容（canEdit）就能看评论。
- 克隆阵容不复制评论；删阵容级联删评论。
- **有 migration**；远程 Dashboard 手工执行后写入才生效（读降级为空，排阵页不 500）。

## Capabilities

### New Capabilities

- `lineup-comments` — 已存阵容的追加式评论：`lineup_comments` 表 + GET/POST/DELETE + 批量读；卡片内可展开
  评论区（倒序时间线 + 编辑模式追加/删除）；机密随已存阵容（canEdit）；克隆不带评论、删阵容级联删；失败降级。

### Modified Capabilities

<none — `lineup-saved-lineups` 的克隆/删除语义不变（克隆本就逐字节复制 assignment/snapshot，不认识评论表，
故天然不带评论；删除的级联在评论表的 FK 上声明，不改 saved_lineups）。已存阵容卡片是宿主 UI，不改其自身需求。>

## Impact

- **后端**：新 `LineupComment` 模型 + migration（`zijing_cup.lineup_comments`，`saved_lineup_id` FK on delete
  cascade、`body` 长度 CHECK、`created_at` server_default）；`routers/lineups.py`（或相邻）加 GET/POST/DELETE +
  批量 `GET /api/…/lineup-comments?ids=…`；注册进 main + models/__init__。
- **前端**：`lib/api.ts` 加 `LineupComment` 类型 + `getLineupCommentsBatch`（非 ok 降级 `{}`）；saved 页/排阵页
  的 server actions 加 `addLineupComment`/`deleteLineupComment`（经 `adminWrite` scope）；`SavedLineups` 卡片加
  可展开评论区组件（编辑态追加/删除，`useLineupEdit`/`canEdit && editing` gate）。
- **有 migration、有远程前置**（push 前远程先建表，否则追加/删除 500；读降级）。

## Out of Scope

- 候选阵容（临时结果）评论——只 saved lineups。
- 就地编辑一条评论、分类/评分/@人/富文本。
- 跨阵容评论聚合/检索。
