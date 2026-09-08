---
Date: 2026-09-07
Change: notes-surfacing
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-07-notes-surfacing-requirements.md
---

## Why

球员评价（`player-notes`）目前只在队员详情页可见，但排阵、对手对比、看队伍名单才是队长真正做决策
的时刻。把评价只读地带到这三个界面，让「这人有记弱点/优点/适合搭档」在排阵当下一眼可见。

## What Changes

- 新增一个**按 player id 批量取评价**的只读端点，供三个界面一次往返拿回整批球员的评价。
- 排阵页（候选卡 + 已存阵容，经共享 `LineBlock` seat）加一个**单标记「评」**：含弱点用警示色、
  否则中性色，无评价不显示；点/悬停 → 评价时间线弹层（只读）。
- 队伍 roster 每行、对手对比两侧逐线每对球员，加**整组分类小标**（优点●/弱点▲/搭档◆/其他），
  点/悬停 → 同一个时间线弹层。
- 三处都按 `canEdit(season, division)` 机密门：未解锁不取数、不显示；对手对比两侧都显示。
- 纯只读展示 + 轻提示：**不改引擎、不改合法性判定、不改候选排序/推荐**；追加/删除仍只在详情页。

## Capabilities

### New Capabilities

- `notes-surfacing` — 把球员评价只读地展示到排阵/对手对比/roster：批量读端点、两种密度的展示
  （排阵 seat 单标记 vs roster/compare 分类小标）、共用时间线弹层、机密门、失败降级。

### Modified Capabilities

<none — 宿主界面（lineup-ui / opponent-compare / team-roster-ui）自身的需求不变，评价是叠加在其上的
独立能力；`player-notes` 的数据模型与写路径也不变，只新增一个批量读端点属于本新能力。>

## Impact

- **后端**：`app/routers/players.py` 加批量读端点 `GET /api/players/notes?ids=…`（复用 `PlayerNote`
  查询，按 player_id 分组返回）。无新表、无 migration。
- **前端 api 层**：`lib/api.ts` 加 `getPlayerNotesBatch(ids)`（非 ok 降级 `{}`）；给 `LineupPlayer` /
  `LineupCandidate` seat 数据加 `player_id`（后端 lineup 查询把 `player.id` 一并带出，key 已是
  `{PREFIX}{id}`）。
- **前端组件**：新增共享 `NotesPopover`（时间线弹层）+ `PlayerNotesBadges`（roster/compare 分类小标）+
  `LineSeat` 的单标记「评」；接入 `LineBlock`（覆盖候选+已存）、`RosterTable`、compare 行；各页仅
  `canEdit` 时批量取数并传入。
- **无数据库变更**、无部署前置（不像带 migration 的 change）。

## Out of Scope

- 三处的写操作（追加/编辑/删除仍只在球员详情页）。
- 精确「推荐搭档已排入」匹配（搭档是自由文本，无结构化引用）。
- 任何引擎/合法性/排序/推荐改动。
- 跨球员的评价聚合/检索/筛选/按类别过滤（v1 只做展示）。
