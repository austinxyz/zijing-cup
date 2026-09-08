## 1. 后端：lineup_comments 表 + migration + 端点

### Contract
- **Spec**:
  - 系统 SHALL 有一张 `lineup_comments` 表：`saved_lineup_id` FK → `saved_lineups(id)` `on delete cascade`；`body` text（长度 1–2000，DB CHECK）；`created_at` server_default now() NOT NULL。写入 SHALL 追加、MUST NOT 覆盖。删阵容 SHALL 级联删其评论。
  - 系统 SHALL 提供：单阵容 GET 列出（倒序 `created_at desc, id desc`）、POST 追加、DELETE 删一条（按 saved_lineup_id + comment id）；以及批量读端点 `GET /api/…/lineup-comments?ids=…`，按 saved_lineup_id 分组返回、只放有评论的 id、ids 去重/忽略非法/clamp、空 ids → 空映射。GET 需 X-Backend-Secret；POST/DELETE 按方法自动需 X-Admin-Secret。空 body 拒；超长（>2000）拒为 422（不落 500）。MUST NOT 提供就地编辑端点。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_lineup_comments.py -q`（本地需 BACKEND_SECRET/ADMIN_SECRET env）→ expected: 全部通过，无 import 错；覆盖批量倒序分组、空 body/超长 422、鉴权 401/403、跨阵容删 404、级联删。
- **Code**:
  - `LineupComment` 模型 `created_at` 用 `sa_column=Column(DateTime(tz), server_default=func.now(), nullable=False)`——别 `Optional=None`（会发 NULL，CLAUDE.md）。
  - migration 以 `set search_path to zijing_cup, public;` 开头 + `body` 长度 CHECK + FK `on delete cascade` + `(saved_lineup_id, created_at desc)` 索引；本地按整份文件一次 `execute`（断言 `127.0.0.1`），别按 `;` 切句。
  - 批量路由 `…/lineup-comments` 声明**在**任何 `/{id}/comments` 之前，避免被路径参数吃掉；配一条“路由确实注册”断言。
  - `CommentIn.body` = `Field(min_length=1, max_length=2000)` + trim（纯空白拒 422）；`_parse_ids` 去重/忽略非法/clamp≤200。
  - 写鉴权靠方法判权中间件自动生效——不加前缀判断、不加依赖。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/lineup-comments/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — write failing pytest: POST 一条评论到某 saved_lineup 后 GET 返回该条（倒序），空 body → 422、>2000 → 422
- [x] 1.2 GREEN — `LineupComment` 模型 + migration SQL 文件 + 本地 execute；注册进 `models/__init__` + main；POST/GET 端点 + `CommentIn`
- [x] 1.3 RED — write failing pytest: DELETE 按 saved_lineup_id+id 删；跨阵容（正确 id 错 lineup）→ 404；删 saved_lineup 级联删其评论
- [x] 1.4 GREEN — DELETE 端点（按 saved_lineup_id + comment id 双条件）；确认 FK cascade 生效
- [x] 1.5 RED — write failing pytest: 批量 `GET …/lineup-comments?ids=a,b` 分组倒序、只放有评论的 id、空 ids → `{}`、非法/重复 id 去重忽略/clamp；GET 无 backend secret → 401、POST/DELETE 无 admin secret → 403；断言批量路由已注册
- [x] 1.6 GREEN — 批量读端点（`_parse_ids` 去重/clamp、grouped desc、only-ids-with-comments）；批量路由前置于 `/{id}`
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：api + server actions + 卡片可展开评论区

### Contract
- **Spec**:
  - 已存阵容卡片 SHALL 有一个可展开「评论 N ▾」区：折叠态显示计数，点开显示倒序时间线（文本 + 时间 + 删除）+ 追加框。追加/删除 SHALL 只在编辑模式（`canEdit && editing`）可见可用；查看模式只读。空文本 MUST NOT 可提交；写失败就地报错。评论经既有 `adminWrite`（按比赛 scope）写、成功 `revalidatePath` 刷新。
  - 评论 SHALL 只在能看到已存阵容时可见……一屏多卡 SHALL 用一次批量请求取回评论。`getLineupCommentsBatch` 失败 SHALL 降级为 `{}`。
  - 克隆一套已存阵容 MUST NOT 复制原阵容的评论——克隆得到新 saved_lineup id，其评论为空。
- **Runtime**: `cd frontend; npx vitest run lib/api.test.ts app/[season]/[division]/lineup` 且 `cd frontend; npx tsc --noEmit` → expected: 新增用例全绿、tsc 0 错（vitest 不做类型检查，两条都要过）。
- **Code**:
  - `lib/api.ts` 加 `LineupComment` 类型（`{id, body, created_at}`）+ `getLineupCommentsBatch(ids): Record<number, LineupComment[]>`——空→`{}`不请求、非 ok/异常→`{}`降级（对称 `getPlayerNotesBatch`）。
  - server actions `addLineupComment`/`deleteLineupComment` 经 `lib/admin.ts` 的 `adminWrite`（scope `{season,division}`），trim/空则 no-op，成功 `revalidatePath(path, "layout")`。
  - `SavedLineups` 卡片底部**卡片内可展开区**（本地 `useState` 折叠/展开）——不是 body-portal 弹层（躲触屏 hover 坑，CLAUDE.md）；追加/删除 gate = `useLineupEdit` 的 `canEdit && editing`；删除就地确认；复用 `notesDisplay.formatWhen`。
  - 排阵页 `page.tsx`/saved 页在 `canEdit` 时按本屏 saved_lineup id 批量取评论传入；未解锁不取。克隆不复制评论是后端 clone 的内在行为——前端无需改。
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/lineup-comments/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — write failing vitest: `getLineupCommentsBatch([])` → `{}` 不请求；非 ok 响应 → `{}`；正常 → `Record<id, LineupComment[]>`
- [x] 2.2 GREEN — `lib/api.ts` 加 `LineupComment` 类型 + `getLineupCommentsBatch`（降级 `{}`）
- [x] 2.3 RED — write failing vitest: `addLineupComment` 空/纯空白 → no-op 不调 `adminWrite`；有文本 → POST scope `{season,division}` + revalidate；`deleteLineupComment` → DELETE + revalidate
- [x] 2.4 GREEN — server actions `addLineupComment`/`deleteLineupComment`（经 `adminWrite`、trim、成功 revalidate）
- [x] 2.5 MOCK — open docs/superpowers/specs/mocks/2026-09-07-lineup-comments-mocks.html; note tokens（`--surface`/`--border`/`--primary`/`--danger`/`--muted-fg`）+ verbatim 文案（「评论」计数、「追加」、「删除」、「删除这条？确认/取消」、textarea placeholder）
- [x] 2.6 RED — write failing vitest: 编辑模式（`canEdit && editing`）展开卡片评论区显示追加框 + 逐条删除；查看模式只读（无追加框、无删除）；空文本「追加」禁用；计数正确
- [x] 2.7 GREEN — `SavedLineups` 卡片内可展开评论区组件（折叠计数 / 展开倒序时间线 + 编辑态追加/删除就地确认）；wire `getLineupCommentsBatch` 结果 + gate
- [x] 2.8 VISUAL DIFF — bring up dev stack; 解锁进排阵页；展开已存阵容评论区，对照 mock（折叠计数、编辑态追加/删除、查看只读、移动端全宽）；fix token/color/text 漂移
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证 + 交付

- [x] 3.1 Run backend test suite — `backend/.venv-std/Scripts/python.exe -m pytest -q`（先跑测试，再补种——CLAUDE.md）；601 passed 无回归
- [x] 3.2 Run frontend test suite — `cd frontend; npx vitest run` + `cd frontend; npx tsc --noEmit`；620 passed（2 known-flaky pass isolated）、tsc 0 错
- [x] 3.3 E2E — 补种 + 造 saved lineup；实测：编辑态追加（CJK 正确渲染）+删除（就地确认）、克隆得空评论（副本 评论 0）、批量倒序、级联删；curl 灌入的中文因 shell 编码乱码，但走 app 写路径的中文正常
- [x] 3.4 Run superpowers:verification-before-completion — 后端 601 passed / 前端 620 passed（2 known-flaky pass isolated）/ tsc 0；console.log 无；migration schema-qualified OK；secret 扫描仅命中两处既有（page.tsx 注释、session.ts，非本 change 引入）；远程前置在交付说明点明（push 前 Dashboard 建表）
