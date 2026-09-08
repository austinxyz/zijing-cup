---
Date: 2026-09-07
Change: notes-edit-on-surfaces
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-07-notes-edit-on-surfaces-requirements.md
---

## Why

`notes-surfacing` 把评价只读地带到了 roster，但要改一条评价仍得跳去球员详情页。队长看名单时最常想
当场加一条弱点/搭档。只在 roster 的编辑模式下开放就地追加/删除，去掉这趟往返。

## What Changes

- 队伍名单页**编辑模式**下，评价弹层从只读变可编辑：加追加表单（类别+文本+追加）+ 每条就地确认删除。
- 无评价的队员在编辑模式显示「＋记评价」入口（否则没有小标可点、加不了第一条）。
- 排阵、对手对比、以及 roster 的**查看模式**保持只读（不传可编辑标志，无回归）。
- 复用既有 `addPlayerNote`/`deletePlayerNote`（`adminWrite` 按比赛 scope、`revalidatePath(..., "layout")`）。
  **无后端改动、无 migration**。

## Capabilities

### New Capabilities

<none>

### Modified Capabilities

- `notes-surfacing` — 新增「roster 编辑模式下评价可就地追加/删除」的行为：可编辑弹层、无评价者的
  「＋记评价」入口、按 roster 编辑模式 gate；其余只读展示（排阵/对比/roster 查看模式）不变。

## Impact

- **前端组件**：`NotesPopover`（或 `PlayerNotesBadges`）加**可选**编辑能力（默认只读）——editable 时渲染
  追加表单 + 逐条删除，绑定 `addPlayerNote`/`deletePlayerNote`；面板是 body portal，表单内点击不被
  「点外部关闭」误关。
- **roster 接线**：`TeamEditPanel` → `RosterTable` → badges 传入编辑标志（来自 `useTeamEdit` 的
  `canEdit && editing`）+ season/division/playerId；无评价者渲染「＋记评价」触发器。
- **无后端、无 migration、无远程前置**。
- 排阵（`CandidateCards`/`SavedLineups`→`LineBlock`）与对手对比（`compare/page`）**不传** editable，保持只读。

## Out of Scope

- 排阵、对手对比开放编辑（仍只读）。
- 就地编辑一条评价（仍是追加 + 删除）。
- 评价数据模型 / 类别 / 机密语义 / 后端端点的任何改动。
