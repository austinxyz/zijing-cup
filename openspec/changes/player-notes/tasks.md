# Tasks — player-notes

## 1. 后端：player_notes 表 + migration + GET/POST/DELETE

### Contract
- **Spec**: player-notes —— 「系统 SHALL 有一张 `player_notes` 表…`category` 限定 strength/weakness/partner/other（DB check）…`created_at` server_default now() NOT NULL…写入 SHALL 追加、MUST NOT 覆盖」；「GET 倒序、POST 追加、DELETE 删一条；GET 需 X-Backend-Secret、POST/DELETE 按方法自动需 X-Admin-Secret；空 body 拒；MUST NOT 提供就地编辑端点」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "note"` → expected: 表/端点单测过（追加不覆盖、倒序、category 约束、空 body 拒、删一条）；无 import 错。
- **Code**: `PlayerNote` model——`created_at` 用 `sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)`（别 `Optional[datetime]=None`，会发 NULL）；migration 以 `set search_path to zijing_cup, public;` 开头、category CHECK 约束；router GET `order_by(created_at.desc())`/POST 校验 body 非空+球员存在/DELETE 按 (player_id,note_id)；注册进 main + models/__init__；**不做**编辑端点。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/player-notes/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — `tests/test_player_notes.py`：POST 追加两条 → GET 倒序返回两条、不覆盖。断言失败（端点/表不存在）
- [ ] 1.2 GREEN — 建 migration（本地签名解释器打本地栈，先断言 127.0.0.1）+ `PlayerNote` model + GET/POST 端点 + 注册
- [ ] 1.3 RED — 测 category 非法被拒（DB check）、空 body 被拒（422/400）
- [ ] 1.4 GREEN — POST 校验 body 非空；确认 check 约束生效
- [ ] 1.5 RED — 测 DELETE 删一条（其余保留）、删不存在的 404、鉴权（无 X-Backend-Secret GET 401 / 无 X-Admin-Secret POST/DELETE 403）
- [ ] 1.6 GREEN — DELETE 端点 + 确认中间件按方法判权覆盖
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/player-notes/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS else FIX + retry

## 2. 前端 api 层 + server actions

### Contract
- **Spec**: player-notes —— GET/POST/DELETE 的前端出口；「写入经 `adminWrite` 按比赛 scope 判权」；「空文本不写」。
- **Runtime**: `cd frontend && npm run test -- notes` → expected: `getPlayerNotes` 请求 URL + 非 ok 降级 []、`addPlayerNote`/`deletePlayerNote` 调 adminWrite 参数/scope 的单测过；`npx tsc --noEmit` 干净。
- **Code**: `lib/api.ts` 加 `PlayerNote`（category literal union）+ `getPlayerNotes`（**非 ok 返回 []** 降级，远程 migration 滞后不打崩详情页）；players `actions.ts` 加 `addPlayerNote`（POST，body trim）/`deletePlayerNote`（DELETE），经 `adminWrite` scope `{season,division}`，成功 `revalidatePath`。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/player-notes/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — `lib/api.test.ts` 加测：`getPlayerNotes` 请求 `/api/players/<id>/notes`；非 ok 返回 []
- [ ] 2.2 GREEN — 实现 `PlayerNote` + `getPlayerNotes`
- [ ] 2.3 RED — `players/[id]/actions.test.ts`（或 players actions 测）：`addPlayerNote` 调 `adminWrite("POST",".../notes",{category,body},{season,division})`；`deletePlayerNote` 调 DELETE；body trim
- [ ] 2.4 GREEN — 实现两个 server action
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + diff; review + score; ≥80 PASS else FIX + retry

## 3. 详情右栏「评价」区（机密门 + 追加式时间线）

### Contract
- **Spec**: player-notes —— 「详情右栏 SHALL 有『评价』区：追加表单（类别下拉+文本+追加）+ 倒序时间线（类别中文标签+文本+时间+删除）；删除就地确认；空文本不可提交；无评价空态；类别 key→中文」；「评价按 canEdit gate：仅 canEdit 时取评价并渲染，未解锁不显示内容也不发取评价请求」。
- **Runtime**: `cd frontend && npm run test -- notes players` → expected: NotesSection + PlayerDetail 机密门单测过；`npx tsc --noEmit` 干净。
- **Code**: `PlayerDetail` 加 `notes: PlayerNote[] | null` prop（null=未解锁不渲染评价区）；工作台 `page.tsx` 与 `[id]/page.tsx` `const notes = canEdit ? await getPlayerNotes(...) : null` 并发取；`NotesSection`（client）时间线 + 追加表单 + 每条删除（就地确认），写控件包 `EditOnly`（canEdit&&editing），空 body 按钮 disabled，key→中文 label；写失败就地报错、成功靠 revalidate 刷新。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/player-notes/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-09-06-player-notes-mocks.html；记 token 与文案（「评价」「追加」类别中文、删除/确认/取消、空态「还没有评价」、未解锁「评价是机密，解锁本比赛后可见」）
- [ ] 3.2 RED — 测 NotesSection：倒序渲染类别标签+文本+时间；空文本追加禁用；点删除出就地确认、取消不删、确认调 deletePlayerNote
- [ ] 3.3 GREEN — 实现 `NotesSection` + `PlayerDetail` 接线（notes prop）
- [ ] 3.4 RED — 测机密门：PlayerDetail `notes={null}` 不渲染评价区内容；page 未 canEdit 不调 getPlayerNotes
- [ ] 3.5 GREEN — page.tsx / [id]/page.tsx 仅 canEdit 时取 notes 传入；未解锁传 null
- [ ] 3.6 VISUAL DIFF — bring up dev stack；解锁本比赛开某队员详情；比对评价区/时间线/删除确认/空态与 mock；修 token/文案漂移
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + specs/player-notes/spec.md + design.md + diff; review + score (threshold 70); ≥70 PASS else FIX + retry

## 4. 验证

### Contract
- **Spec**: player-notes 全部 SHALL。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest` 全绿 + `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + 新源码无 console.log。
- **Code**: 交付后本地实测（补种 + 本地跑 migration + 解锁该组）：给某球员追加优点/弱点/搭档各一条→倒序显示；删一条其余保留；未解锁会话看不到评价区、不发取评价请求。pitfall：先测→再补种→再视觉；本机后端裸 uvicorn 不带 --reload 改完杀进程重起；**push 前远程 Dashboard 先执行建表 SQL**（否则线上 500）。
- **Threshold**: 80

- [ ] 4.1 Run superpowers:verification-before-completion — 后端 pytest + 前端 vitest + tsc + console.log 审计全过；本地真实数据 e2e（追加三类 + 删除 + 机密门）实测；修任何失败再收工；给出远程 migration SQL 待负责人执行
