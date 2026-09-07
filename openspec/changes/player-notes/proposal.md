---
Date: 2026-09-06
Change: player-notes
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-06-player-notes-requirements.md
---

## Why

一个球员现在只有 UTR 数字和名单归属。教练想记主观评价——优点、弱点、和谁搭档好——并让它**随时间
叠加**（一条条追加、每条带时间），日后排阵/裁决回看。当前没有任何地方存这类文字。

## What Changes

- **新表 `player_notes`**（`zijing_cup` schema）：`id`、`player_id`（FK players）、`category`
  （`strength`/`weakness`/`partner`/`other`，DB check 约束）、`body`（文本）、`created_at`
  （server_default now()、NOT NULL）。评价挂球员、跨赛季全局。
- **后端三端点**：GET `/api/players/{id}/notes`（按 created_at 倒序）、POST（追加 `{category, body}`）、
  DELETE `/api/players/{id}/notes/{note_id}`（删一条）。GET 受 `X-Backend-Secret`；POST/DELETE 是写
  方法，中间件按方法自动要求 `X-Admin-Secret`。**不做就地编辑**。
- **详情右栏「评价」区**（`PlayerDetail`）：追加表单（类别下拉 + 文本 + 追加）+ 时间线列表（类别标签 +
  文本 + 时间 + 删除；删除就地确认）。空文本不提交。
- **机密**：评价按 `canEdit(season, division)` gate——页面**仅在 canEdit 时**取评价并渲染追加/删除入口；
  未解锁看不到内容、也不发取评价请求（同已存阵容）。

## Capabilities

### New Capabilities

- **player-notes** —— `player_notes` 表 + GET/POST/DELETE 端点 + 详情右栏「评价」区（分类追加式时间线、
  机密、只追加+可删）。

### Modified Capabilities

（无——评价区挂在 `PlayerDetail` 内，但作为 player-notes 的新行为定义；不改 player-admin-ui 既有需求。）

## Impact

- 后端：新 model `PlayerNote`（`app/models/`）+ router（`app/routers/player_notes.py` 或并入 players
  路由）+ migration `supabase/migrations/*_create_player_notes.sql`。
- 前端：`lib/api.ts` 加 `PlayerNote` 类型 + `getPlayerNotes`；`players/[id]/actions.ts`（或 players
  `actions.ts`）加 `addPlayerNote`/`deletePlayerNote`（经 `adminWrite`，scope {season,division}）；
  `PlayerDetail` 加「评价」区组件（client 追加表单 + 删除确认，`EditOnly`/canEdit 门）。
- **有 migration**：远程共享 Supabase 走 Dashboard 手工执行；**读新表的后端 push 前远程必须先执行**，
  否则线上 500。本地用签名解释器把 SQL 打到本地栈（断言 127.0.0.1）。

## Out of Scope

- 就地编辑一条评价；结构化搭档选人（搭档是自由文本）；作者/归属；评价的检索/筛选/跨球员聚合；评分/打星。
- 不改球员既有数据模型（评价是独立新表，删表即回到无评价）。
