## Context

`notes-surfacing` shipped a read-only overlay: shared `NotesPopover` (body-portaled, read-only timeline),
`PlayerNotesBadges` (roster/compare pills), and a LineBlock seat「评」marker. Write actions
`addPlayerNote`/`deletePlayerNote` already exist (used by the detail-page `NotesSection`) and revalidate the
`players` layout (covers the roster route). This change makes the roster overlay editable — in edit mode only —
without touching the backend or the other surfaces.

## Goals / Non-Goals

**Goals:**
- roster 编辑模式：可编辑弹层（追加表单 + 逐条确认删除）+ 无评价者「＋记评价」入口。
- 编辑能力是共享组件上的**可选**能力，默认只读；排阵/对比/roster 查看模式不传 → 无回归。

**Non-Goals:**
- 不动后端、端点、模型、类别、机密语义；无 migration。
- 不在排阵/对比开放编辑；不做就地编辑一条（仍追加 + 删除）。

## Decisions

- **D1 可编辑能力做成 `NotesPopover` 的可选 prop。** 加 `edit?: { onAdd; onDelete; pending? }`（或
  `editable` + 绑定的 actions）。传了才渲染追加表单（复用详情页 `NotesSection` 的类别常量、trim/空校验、
  就地确认删除逻辑；把可复用片段抽到 `components/notes/`）；不传 = 现有只读弹层，一字不变。排阵/对比/
  roster 查看模式不传。
- **D2 追加表单在 portal 面板内。** 面板已是 body portal（`notes-surfacing` 修 overflow 裁剪时定）；
  「点外部关闭」判断已是 `!panelRef.contains(target)`，表单在面板内 → 输入/选择不会误关。追加成功后
  清空文本框，靠 `revalidatePath` 刷新时间线（server action 已 layout-scope）。
- **D3 无评价者的「＋记评价」入口在 `PlayerNotesBadges`。** 现在 `notes.length===0 → null`。改为：传了
  editable 时，空 notes 渲染一个「＋记评价」`NotesPopover` 触发器（弹层只有追加表单、时间线空态
  「还没有评价，追加第一条。」）；非 editable 仍 `null`。
- **D4 编辑标志从 roster 编辑上下文来。** `TeamEditPanel` 读 `useTeamEdit()` 的 `canEdit && editing`，
  作为 `editable` 传给 `RosterTable` → 两处 `PlayerNotesBadges`（移动卡 + 桌面行）。同时把
  season/division/teamPlayerId 需要的绑定传下（server actions 需要 season/division/playerId）。
  `RosterTable` 目前拿不到 season/division —— 由 `TeamEditPanel`（有 roster.team + season/division 来自 page）
  绑定好 `addPlayerNote`/`deletePlayerNote` 传下，或直接把两个 bound action 传进去。
- **D5 只读组件签名保持向后兼容。** `NotesPopover`/`PlayerNotesBadges` 新增的都是可选 prop，现有
  lineup/compare/roster-view 调用点不改即保持只读；已存单测不回归。

## Risks / Trade-offs

- **[共享组件长胖，只读回归]** → 编辑分支全部 gated 在可选 prop 后；给「传 editable 渲染表单/删除」「不传
  只读」都补单测；跑全量 vitest 确认 lineup/compare/roster-view 只读测不红。
- **[server action 绑定跨 server→client]** → 传**绑定好的 server action**（`addPlayerNote.bind(...)` 风格或
  在 client 里用 startTransition 调用 imported action）——server action 可跨界，普通函数不可（CLAUDE.md 坑）。
  roster 页是 server component，`TeamEditPanel` 是 client；沿用详情页 `NotesSection` 直接 import server action
  的既有模式最简。
- **[空文本/写失败]** → 复用 `NotesSection` 已有的 trim+disabled + try/catch 就地报错；成功才清空。
- **[本机 e2e]** → 复用 notes-surfacing 的本地栈流程；in-app 浏览器登录用 `requestSubmit()`；改后端不涉及
  （本 change 无后端），但若之前 backend 进程陈旧仍需裸 uvicorn 重起。

## Migration Plan

无数据库变更、无 migration、无远程前置。纯前端；后端 push 也不需要（无后端改动）。

## Open Questions

无。设计细节（editable prop 的确切形状、可复用片段抽取位置）在 apply 的 RED/GREEN 里定。
