# Tasks — notes-edit-on-surfaces

## 1. 共享组件：可编辑弹层 + 「记评价」入口

### Contract
- **Spec**: notes-surfacing —— 「roster 编辑模式下评价可就地编辑：弹层顶部追加表单（类别+文本+追加）、
  时间线每条就地确认删除；空文本 MUST NOT 可提交；写失败就地报错」；「无评价的队员有『＋记评价』入口，
  点击打开同一个可编辑弹层；查看模式 MUST NOT 显示」；「编辑能力是共享组件上的**可选**能力，不传则只读，
  只读弹层不含写控件」。
- **Runtime**: `cd frontend && npm run test -- NotesPopover PlayerNotesBadges` + `npx tsc --noEmit` → expected: 可编辑弹层（有表单+删除、空文本禁用、点删除就地确认）与只读弹层（无写控件）单测过；`PlayerNotesBadges` 空 notes+editable 渲染「＋记评价」、非 editable 渲染 null 的单测过；tsc 干净。
- **Code**: `NotesPopover` 加**可选** `edit` 能力（传绑定好的 add/delete server action + pending/错误态），传了才渲染追加表单（复用 `NotesSection` 的类别常量、trim/空校验、就地确认删除）+ 逐条删除；不传 = 现有只读弹层不变。`PlayerNotesBadges` editable 且空 notes → 渲染「＋记评价」触发器（弹层空态「还没有评价，追加第一条。」）；非 editable 空 → null。面板是 body portal，表单内点击不被「点外部关闭」误关。只读组件签名向后兼容（新增全是可选 prop）。
- **Threshold**: 70

- [x] 1.0 CONTRACT — write openspec/changes/notes-edit-on-surfaces/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 MOCK — open docs/superpowers/specs/mocks/2026-09-07-notes-edit-on-surfaces-mocks.html；记 token 与文案（追加表单类别中文/占位「写一条评价…」/追加、删除→删除这条？确认/取消、空态「还没有评价，追加第一条。」、入口「＋记评价」）
- [x] 1.2 RED — 测 `NotesPopover` editable：传 edit 时渲染追加表单（类别下拉+文本+追加）、空文本追加禁用、点某条删除出就地确认、确认调删除；不传 edit 时无表单无删除（只读）
- [x] 1.3 GREEN — 实现 `NotesPopover` 可选 edit 能力（复用 NotesSection 逻辑/常量）
- [x] 1.4 RED — 测 `PlayerNotesBadges`：editable && 空 notes → 渲染「＋记评价」触发器（点开弹层空态）；非 editable && 空 → null；有 notes 时 editable 传入弹层 edit 能力
- [x] 1.5 GREEN — 实现 `PlayerNotesBadges` editable 分支 + 「＋记评价」入口
- [x] 1.6 VISUAL DIFF (组件已建；真机上页视觉核对在组2接线后于组3 e2e做) — bring up dev stack；roster 解锁+编辑模式：有评价点小标改、无评价点「＋记评价」加第一条；比对追加表单/删除确认/空态/入口与 mock；确认查看模式无编辑入口；修 token/文案漂移
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/notes-surfacing/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores (threshold 70); ≥70 PASS else FIX + retry
  - **RESULT: PASS** (96.4/100) — No CRITICAL/HIGH; read-only protected, empty-body guard, portal containment verified, no RSC-boundary violation; tests 10/10, tsc clean

## 2. roster 接线 + 编辑模式 gate

### Contract
- **Spec**: notes-surfacing —— 「roster 编辑模式（`canEdit && editing`）启用编辑；追加/删除经既有
  `addPlayerNote`/`deletePlayerNote`（按比赛 scope、成功 revalidate）」；「排阵/对手对比/roster 查看模式
  MUST 保持只读——不传可编辑标志」。
- **Runtime**: `cd frontend && npm run test -- "teams/[code]" lineup compare` + `npx tsc --noEmit` → expected: roster 编辑模式下 badges/入口拿到 editable + 绑定 actions 的单测过；查看模式与排阵/对比仍只读（不传 editable）的单测过；tsc 干净、既有只读测不回归。
- **Code**: `TeamEditPanel` 读 `useTeamEdit()` 的 `canEdit && editing` 作 editable，连同绑定好的 `addPlayerNote`/`deletePlayerNote`（season/division/playerId）传给 `RosterTable` → 移动卡 + 桌面行两处 `PlayerNotesBadges`。server action 直接 import 调用（沿用 `NotesSection` 模式，可跨 server→client）。排阵（`CandidateCards`/`SavedLineups`→`LineBlock`）与 `compare/page` **不传** editable，保持只读不回归。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/notes-edit-on-surfaces/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `teams/[code]` 测：编辑模式（editing=true）下 `PlayerNotesBadges` 收到 editable + add/delete；有评价队员弹层含表单、无评价队员显示「＋记评价」；查看模式（editing=false）都只读、无入口
- [x] 2.2 GREEN — `TeamEditPanel` → `RosterTable` → 两处 badges 传 editable + 绑定 actions；无评价者「＋记评价」入口
- [x] 2.3 RED — 回归：排阵候选/已存 seat 与对手对比两侧仍只读（不传 editable，弹层无写控件、seat 无编辑）
- [x] 2.4 GREEN — 确认 lineup/compare 调用点不传 editable（通常无需改码，补断言/必要时收口）
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + diff; review + score; ≥80 PASS else FIX + retry

## 3. 验证

### Contract
- **Spec**: notes-edit-on-surfaces 全部 SHALL。
- **Runtime**: `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + 新源码无 console.log。
- **Code**: 交付后本地实测（补种 + 解锁 + 进编辑模式）：roster 给某队员追加优点/弱点各一条→即时显示；删一条其余保留；无评价队员点「＋记评价」加第一条；查看模式与排阵/对手对比仍只读、无编辑入口。pitfall：先测→再补种→再视觉；本机前端 dev 起 preview_start；in-app 浏览器登录用 `requestSubmit()`；无 migration、无远程前置。
- **Threshold**: 80

- [x] 3.1 Run superpowers:verification-before-completion — 前端 vitest + tsc + console.log 审计全过；本地真实数据 e2e（编辑模式加/删 + 无评价加第一条 + view/排阵/对比只读）实测；修任何失败再收工
