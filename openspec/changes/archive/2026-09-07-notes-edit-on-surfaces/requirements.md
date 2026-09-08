---
Date: 2026-09-07
Change: notes-edit-on-surfaces
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# notes-edit-on-surfaces — 队伍 roster 上就地编辑球员评价

`notes-surfacing` 已把评价只读地带到 roster / 排阵 / 对手对比。本 change 只在**队伍 roster 页**、
且只在**编辑模式**下，让评价从只读变成可就地追加/删除，省去为改一条评价专门跳去球员详情页。
排阵与对手对比保持只读。

## Goals

1. **roster 编辑模式下可就地追加/删除评价。** 队伍名单页解锁并进入编辑模式后，每名队员的评价弹层里
   多出：追加表单（类别下拉 + 文本 + 追加）+ 每条就地确认删除——与球员详情页 `NotesSection` 同款行为。
2. **无评价的队员也能加第一条。** 编辑模式下，没有评价（没有小标可点）的队员显示一个「＋记评价」入口，
   打开同一个可编辑弹层。
3. **按编辑模式 gate，与 roster 其它写一致。** 追加/删除仅在 `canEdit && editing` 时可见可用；查看模式、
   以及排阵/对手对比三处保持**只读**（不传可编辑标志）。
4. **复用既有写路径。** 追加/删除走已存在的 `addPlayerNote`/`deletePlayerNote`（`adminWrite` 按比赛 scope、
   成功 `revalidatePath(..., "layout")` 已覆盖 roster），成功后弹层/列表刷新；写失败就地报错。

## Non-Goals

- 不在排阵、对手对比开放编辑（仍只读）。
- 不改评价数据模型、类别集合、机密语义、后端端点（写端点早已存在）。
- 不做就地编辑一条评价（仍是追加 + 删除；与 player-notes 一致）。
- 不改只读展示形态（分类小标 / seat「评」/ 时间线弹层不变）。

## Constraints

- 架构不可违反：写经 `lib/admin.ts` 的 `adminWrite`（唯一写出口、按比赛 scope 判权）；浏览器不接触后端凭据。
- **无新后端、无 migration**：`player_notes` 表与 GET/POST/DELETE、批量读端点、server actions 都已就绪。
- 机密门与 gate：可编辑标志来自 roster 的编辑上下文（`useTeamEdit` 的 `editing` + `canEdit`），不是新机制。
- 共享组件 `NotesPopover` / `PlayerNotesBadges` 目前被三处复用且只读——加编辑能力必须**可选**（默认只读），
  排阵/对手对比不传，保持只读不回归。
- 弹层是 body portal（`notes-surfacing` 修复 overflow 裁剪时定的）——编辑表单放在 portal 面板内，
  面板内的点击不能被「点外部关闭」误关（面板包含事件目标即忽略）。
- `npm run test` 不做类型检查，验证要带 `npx tsc --noEmit`；新源码无 `console.log`。

## Success Criteria

1. roster 解锁 + 编辑模式：点某队员评价小标/「＋记评价」→ 弹层含追加表单 + 每条删除；追加一条后即时出现，
   删除就地确认后消失（靠 revalidate 刷新）。
2. 无评价的队员在编辑模式显示「＋记评价」入口，可加第一条；查看模式下不显示该入口。
3. 查看模式的 roster、以及排阵候选/已存与对手对比两侧，评价仍**只读**（无追加/删除控件）。
4. 追加空文本不可提交；写失败就地报错、不静默吞。
5. 前端 vitest + `npx tsc --noEmit` 全绿；本地真实数据 e2e：编辑模式加/删一条评价、无评价队员加第一条、
   view/排阵/对比仍只读——实测过。

## User Stories

- 作为队长，我在看某队名单、发现某人该记一条弱点时，想当场加上，不必跳去球员详情页再回来。
- 作为队长，我想给一个还没有任何评价的队员记第一条评价，名单页上就有入口。
- 作为只读访问者或查看模式的我，名单上的评价仍然只读、也看不到编辑入口。

## Open Questions

N/A (bounded) — 关键点已定：只 roster、编辑模式 gate、弹层内编辑 + 每行「记评价」入口、复用既有 actions。
设计细节（可编辑弹层是扩展 `NotesPopover` 还是复用 `NotesSection` 片段、编辑标志如何从 `TeamEditPanel`
传到 `RosterTable`→badges）留待 propose/design。

## Referenced Capabilities

- `notes-surfacing`（本 change 直接扩展它的 roster 展示为可编辑；只读展示与三处 gate 不变）
- `player-notes`（复用写端点与 `addPlayerNote`/`deletePlayerNote` server actions、类别集合、机密语义）
- `team-roster-ui`（roster 页的编辑模式上下文 `useTeamEdit` 是 gate 来源）
- `admin-access` / `admin-credentials`（`canEdit` 判权）
