# Tasks — notes-surfacing

## 1. 后端：批量读评价端点

### Contract
- **Spec**: notes-surfacing —— 「系统 SHALL 提供一个按 player id 列表批量返回评价的只读端点…按 player_id
  分组返回，每名球员的评价按 `created_at` 倒序」；「无评价或不存在的 id **不出现**在返回映射里」；
  「空 ids → 空映射，不报错」；「读端点走 backend secret，不需要 admin」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "notes_batch or note"` → expected: 批量端点单测过（多 id 分组倒序、无评价 id 不占键、空 ids 空映射、无 X-Backend-Secret 401），既有 player_notes 测不回归。
- **Code**: 复用 `PlayerNote` 与 `_note_out`；`where player_id in ids order by player_id, created_at desc, id desc` 后 Python 侧分组成 `dict[int, list]`，只放有评价的 id；ids 解析去重、忽略非法项、clamp 数量上限（≤200）；读操作靠方法判权中间件自动保护、不加 admin。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/notes-surfacing/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — `tests/test_player_notes.py`（或新测）：给两名球员各追加评价 → `GET /api/players/notes?ids=a,b` 返回按 id 分组、各自倒序；断言失败（端点不存在）
- [ ] 1.2 GREEN — 加 `GET /api/players/notes` 端点：解析 ids、查询、分组倒序、只放有评价的 id
- [ ] 1.3 RED — 测无评价/不存在的 id 不占键；空 ids 返回 `{}`；ids 超上限被 clamp
- [ ] 1.4 GREEN — 补 id 去重/非法忽略/上限 clamp/空处理
- [ ] 1.5 RED — 测鉴权：无 `X-Backend-Secret` GET 401（读端点，不需 admin）
- [ ] 1.6 GREEN — 确认中间件覆盖（通常无需改码，补断言）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/notes-surfacing/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS else FIX + retry

## 2. 前端 api 批量出口 + seat 带 player_id

### Contract
- **Spec**: notes-surfacing —— 「批量读评价端点」的前端出口；「取数失败降级、不拖垮宿主页：批量取评价
  失败 → 三处降级为『无评价』」（本组实现降级出口，接线在组 4）。seat player_id 是让排阵/对手对比按
  player_id 查 notes 的基础设施。
- **Runtime**: `cd frontend && npm run test -- api` + `npx tsc --noEmit` → expected: `getPlayerNotesBatch` 请求 URL、非 ok/抛错降级 `{}`、空 ids 不发请求 的单测过；tsc 干净（含新增 `player_id` 字段导致的 fixture 补齐）。
- **Code**: `lib/api.ts` 加 `getPlayerNotesBatch(ids): Record<number, PlayerNote[]>`（空数组直接 `{}` 不发请求；非 ok/异常一律 `{}`，与 `getPlayerNotes`/`getTeamPresets` 同款降级）；复用既有 `PlayerNote`。后端 lineup 查询把 `player.id` 带出，`LineupPlayer`/候选 seat 与前端 `LineSeat` 加 `player_id: number`（显式字段，不剥 key 前缀）。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/notes-surfacing/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — `lib/api.test.ts`：`getPlayerNotesBatch([1,2])` 请求 `/api/players/notes?ids=1,2` 并解析映射；空数组不发请求；非 ok → `{}`；抛错 → `{}`
- [ ] 2.2 GREEN — 实现 `getPlayerNotesBatch`
- [ ] 2.3 RED — 后端 lineup 响应带 `player_id`：断言候选/roster seat 数据含 player_id（后端测）；前端类型加字段后 tsc 红出漏改 fixture
- [ ] 2.4 GREEN — 后端 lineup 查询带出 `player.id`；`LineupPlayer`/候选 seat / `LineSeat` 加 `player_id`；补齐 fixture 与类型
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + diff; review + score; ≥80 PASS else FIX + retry

## 3. 共享展示组件（弹层 + 分类小标 + seat 单标记）

### Contract
- **Spec**: notes-surfacing —— 「roster 与对手对比用分类小标（优点正色/弱点警示色/搭档蓝/其他灰，无评价
  不显示）」；「排阵 seat 用单标记『评』（含弱点警示色、否则中性色、无评价不显示；改动只在共享
  `LineBlock` 一处，候选与已存一致）」；「共用只读时间线弹层（倒序、类别标签+文本+时间、只读、桌面
  hover+click / 移动 click、自带滚动）」；「纯展示，不影响排阵逻辑」。
- **Runtime**: `cd frontend && npm run test -- Notes LineBlock` + `npx tsc --noEmit` → expected: `NotesPopover`/`PlayerNotesBadges`/`LineBlock` seat 标记 单测过（倒序渲染、无评价不显、弱点警示色、点开弹层只读无写控件）；tsc 干净。
- **Code**: `NotesPopover`（client，只读时间线，受控 open，`<button>` 触发，`max-h`+`overflow-auto`）；`PlayerNotesBadges`（按类别 pill+条数，空则 null）；`LineBlock` seat 加可选 `notes` → 「评」标记（`category==="weakness"` 警示色否则中性）；类别→中文/颜色 token 抽共享常量（与详情页 `NotesSection` 合一，避免漂移）；弱点统一警示色、优点正色、对比度 ≥4.5:1、容器显式底色。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/notes-surfacing/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-09-07-notes-surfacing-mocks.html；记 token 与文案（分类小标颜色、seat「评」含弱点警示色、弹层倒序时间线、无评价不显、未解锁提示）
- [ ] 3.2 RED — 测 `NotesPopover`：倒序渲染类别中文标签+文本+时间、无追加/删除控件；点/键盘打开
- [ ] 3.3 GREEN — 实现 `NotesPopover` + 共享类别常量
- [ ] 3.4 RED — 测 `PlayerNotesBadges`：按类别渲染 pill+条数、弱点警示色、空 notes 渲染 null；测 `LineBlock` seat：有 notes 显「评」、含弱点警示色、无 notes 不显、点开弹层
- [ ] 3.5 GREEN — 实现 `PlayerNotesBadges` + `LineBlock` seat「评」标记（`LineSeat` 接 notes）
- [ ] 3.6 VISUAL DIFF — bring up dev stack；解锁本比赛开排阵/roster/对手对比；比对 seat「评」、分类小标、弹层、未解锁态与 mock；修 token/文案/对比度漂移
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + diff; review + score (threshold 70); ≥70 PASS else FIX + retry

## 4. 三页接线 + 机密门

### Contract
- **Spec**: notes-surfacing —— 「机密门：仅 canEdit 时批量取评价并渲染；未解锁 MUST NOT 发批量取评价
  请求、MUST NOT 渲染任何标记/内容」；「解锁后对手对比两侧都显示」；「取数失败降级、不拖垮宿主页」；
  「纯展示不改候选集合/排序」。
- **Runtime**: `cd frontend && npm run test -- lineup compare teams` + `npx tsc --noEmit` → expected: 三页机密门单测过（canEdit 时 `getPlayerNotesBatch` 被调且传入、未 canEdit 不调不渲染、对手对比两侧都传、批量失败降级空）；tsc 干净。
- **Code**: 三个 Server Component 页仅 `canEdit(season,division)` 时收集本屏 player_id 批量取、构造 `Record<id,PlayerNote[]>` 传下（排阵：候选+已存经 `LineBlock`；对手对比：两队两侧；roster：`RosterTable` 行）；未解锁传空/`null`、组件不渲染标记；批量取失败（api 已降级 `{}`）→ 无标记、主功能照常；不改候选生成/排序。
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/notes-surfacing/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — 排阵页测：canEdit 时 `getPlayerNotesBatch` 被调、notes 传进候选与已存的 `LineBlock`；未 canEdit 不调、seat 无「评」
- [ ] 4.2 GREEN — 排阵页接线（候选 + 已存阵容）
- [ ] 4.3 RED — 对手对比测：canEdit 时两侧都取并传；未 canEdit 不调、两侧无标记
- [ ] 4.4 GREEN — 对手对比接线（两队两侧）
- [ ] 4.5 RED — roster 测：canEdit 时按名单 id 批量取传给行；未 canEdit 不调不显
- [ ] 4.6 GREEN — roster 接线
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + diff; review + score; ≥80 PASS else FIX + retry

## 5. 验证

### Contract
- **Spec**: notes-surfacing 全部 SHALL。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest` 全绿 + `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + 新源码无 console.log。
- **Code**: 交付后本地实测（补种 + 解锁本比赛）：给几名球员记优点/弱点/搭档 → 排阵候选与已存 seat 出「评」（含弱点警示色）、roster 与对手对比出分类小标、点开弹层读到倒序全文；未解锁看不到、不发批量取数请求；排阵候选集合/排序不受影响。pitfall：先测→再补种→再视觉；本机后端裸 uvicorn 不带 --reload 改完杀进程重起；in-app 浏览器登录用 `requestSubmit()`；无 migration、无远程前置。
- **Threshold**: 80

- [ ] 5.1 Run superpowers:verification-before-completion — 后端 pytest + 前端 vitest + tsc + console.log 审计全过；本地真实数据 e2e（三处展示 + 弹层 + 机密门 + 候选不受影响）实测；修任何失败再收工
