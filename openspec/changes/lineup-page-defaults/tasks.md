## 1. 默认视图：`go` 门控 + 右栏两段（折叠已存阵容 + 候选默认空）

### Contract
- **Spec**: 排阵页 SHALL 保留左右两栏；右栏**上半** SHALL 呈现该队已存阵容且 SHALL 可折叠收起，右栏**下半**为候选区；首次打开（无搜索请求）时下半 SHALL 不含候选，且页面 SHALL NOT 触发候选搜索。候选 SHALL 仅在请求带 `go` 时计算；不带 `go` 的 URL 为草稿（回显控件与已存阵容、SHALL NOT 整解）；带 `go` 的 URL 直接访问 SHALL 得到同一套候选；门控 SHALL 在服务端判定。
- **Runtime**: `cd frontend && npm run test` → expected: page 门控测试（无 go 不取候选 / 有 go 取候选）、既有 lineup page 测试无回归 全通过
- **Code**: D1 `page.tsx` 读 `searchParams.go`：无 go 不调 `getTeamLineups(constraints)`（候选空），仍读 `getSavedLineups`+rules 渲染右栏上半与控件；有 go 走现状（并发候选 + 无约束基线）。`go` 不进 `constraintsFromQuery`，只做开关。D2 右栏 `main` 两段：上段可折叠 `SavedLineups`、下段候选或空态；壳 overflow-hidden，两段各自可滚。
- **Threshold**: 70

- [x] 1.0 CONTRACT — write openspec/changes/lineup-page-defaults/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 RED — vitest：`page.tsx` 门控——无 `go`（带锁定参数）不调用 `getTeamLineups(带约束)`、候选区不渲染；断言走 mock 的 api
- [x] 1.2 GREEN — `page.tsx` 加 `go` 门控：无 go 跳过候选取数、渲染右栏上半+控件+空态
- [x] 1.3 RED — vitest：带 `go=1` 时调用 `getTeamLineups(约束)` 并渲染候选区
- [x] 1.4 GREEN — 有 go 走现状（候选 + 无约束基线并发）；「搜索阵容」按钮提交控件 + `go=1`
- [x] 1.5 RED — vitest：右栏上半折叠组件——点击折叠/展开切换已存阵容可见性（客户端 state）
- [x] 1.6 GREEN — 折叠组件 + 右栏两段组装（上 SavedLineups 可折叠、下候选/空态）
- [x] 1.7 MOCK — open docs/superpowers/specs/mocks/2026-09-03-lineup-page-defaults-mocks.html（① 两栏布局：左控件、右上折叠已存阵容、右下候选默认空）；note 空态串「点搜索阵容计算」与折叠交互
- [x] 1.8 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；无 go 进排阵页对照 mock ①（左控件/右上已存阵容可折叠/右下空态、无候选请求）；桌面 + 375；量对比度 ≥4.5、无横向溢出、44px；fix drift
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 统一「每条线 3 行块」（候选 + 已存阵容，性别符号 ♂/♀ + UTR）

### Contract
- **Spec**: 每一套候选 SHALL 用每条线三行块呈现（行1 线名+和+buffer 占用、行2/3 两名队员各一行含 姓名+性别符号 ♂/♀+参赛 UTR），五条线块横排一行、窄屏折。所有数字取自后端、前端 MUST NOT 做数值比较；桌面与 <768 MUST NOT 横向溢出（撑不下自带横滚）。右栏上半的已存阵容 SHALL 与候选用同一种三行块；已存阵容合法性 SHALL 仍只取后端四态、MUST NOT 由前端从快照重判。
- **Runtime**: `cd frontend && npm run test` → expected: LineBlock 单测（三行、♂/♀、UTR、超 cap 标注）、候选与已存阵容都用 LineBlock 渲染、contrast 测试含 ♂/♀ 对 全通过
- **Code**: D3 抽共用 `LineBlock`（线名+和+buffer 占用；两名队员各一行 姓名+`GenderMark`(♂/♀)+UTR）；`CandidateTable`/`CandidateRow` 与 `SavedLineups` 改用它、五块 `grid-cols-5` 窄屏折。`GenderMark` 颜色新增 token 对，♂/♀ 在各自底色 ≥4.5:1，进 `globals.contrast.test.ts`。前端只显示后端字符串。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-page-defaults/contracts/group-2.md
- [ ] 2.1 RED — vitest：`LineBlock` 渲染一条线三行（线名+和+buffer；两人各一行 姓名+♂/♀+UTR），超 cap 标 danger
- [ ] 2.2 GREEN — `LineBlock` + `GenderMark`；globals.css 加 ♂/♀ token（若与现有 success/danger 不同则新增）
- [ ] 2.3 RED — vitest：候选（`CandidateTable`/`CandidateRow`）用 `LineBlock` 渲染，每套五块；断言两人 UTR+性别可见
- [ ] 2.4 GREEN — 候选改用 `LineBlock`，五块横排
- [ ] 2.5 RED — vitest：已存阵容用同款 `LineBlock`；合法性来自后端 status 不来自快照（沿用既有断言）
- [ ] 2.6 GREEN — `SavedLineups` 改用 `LineBlock` 对齐候选
- [ ] 2.7 RED — vitest：`globals.contrast.test.ts` 加 ♂/♀ 文本对其底色 ≥4.5:1
- [ ] 2.8 GREEN — 调 ♂/♀ token 值至达标
- [ ] 2.9 MOCK — open mock（① 已存阵容三行块、③ 候选三行块）；note ♂ 蓝/♀ 粉、行1「和 X · buf Y」、超 cap 标红
- [ ] 2.10 VISUAL DIFF — dev stack；造已存阵容 + 搜出候选，对照 mock 三行块（五块横排、♂/♀、UTR、超 cap）；桌面 + 375；量对比度 ≥4.5、无横向溢出；fix drift
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 3. 载入阵型：预填现有控件、不即搜、可保存（覆盖/另存）

### Contract
- **Spec**: 载入一套已存阵型 SHALL 把其锁定/排除预填进现有 `LineupControls`、不新画界面；载入 SHALL NOT 立即搜索（URL 为草稿、无 `go`），点「搜索阵容」才算；载入后这套 SHALL 可继续编辑并保存（覆盖原阵型或另存），保存 MUST NOT 要求先搜出候选。
- **Runtime**: `cd frontend && npm run test` → expected: 载入编码不含 `go`（草稿）、保存/另存 action 调用、既有 preset 测试无回归 全通过
- **Code**: D4 载入复用 `buildLoadHref` 写控件参数**不加 `go`**（`go` 门控后写参不再自动搜）；「搜索阵容」= 提交控件 + `go=1`；保存复用 `savePreset`（覆盖）+ 新增「另存」（同 action、不同名），入口在控件区、不要求候选存在。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/lineup-page-defaults/contracts/group-3.md
- [ ] 3.1 RED — vitest：载入一套阵型 → 生成的 URL/参数含该套锁定/排除但**不含 `go`**
- [ ] 3.2 GREEN — 载入写草稿参数（无 go）；确认门控后不自动搜
- [ ] 3.3 RED — vitest：载入后改控件并保存 → 调 savePreset（覆盖）；另存 → 以新名调用；均不要求候选存在
- [ ] 3.4 GREEN — 控件区保存/另存入口（admin 门控表层）；绑定 season/division/team
- [ ] 3.5 MOCK — open mock（② 载入=现有控件预填 + 搜索/保存/另存）；note 草稿提示串、三态（锁定/pin/引擎）
- [ ] 3.6 VISUAL DIFF — dev stack；admin 载入一套阵型 → 控件已填、无候选、URL 无 go；改一处→保存/另存；桌面 + 375；量对比度、44px、无溢出；fix drift
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 4. 就地解锁编辑模式（输 admin 密码，不跳 /login）

### Contract
- **Spec**: 排阵页/已存阵容页 SHALL 提供「编辑模式」开关，就地输入 admin 密码即解锁已有编辑能力（保存候选、编辑/删除已存阵容、载入后保存），无需跳 `/login`；解锁 SHALL 复用现有登录 server action 与会话，密码错/限速沿用登录同款反馈；写操作 SHALL 仍由方法判权中间件保护、MUST NOT 新开信任面。
- **Runtime**: `cd frontend && npm run test` → expected: 编辑模式开关渲染口令输入、正确口令调 login action、错误口令渲染同款反馈、既有测试无回归 全通过
- **Code**: D5 新客户端组件 `EditModeToggle`：开关→口令输入→调**现有** `login`（`useActionState`），成功 `router.refresh()` 让 server 重读会话、`canEdit` 变真；失败用 login 返回的 `bad-password`/`rate-limited` 文案。会话仍 httpOnly cookie；写路由仍方法判权；已登录显示「已解锁·登出」。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/lineup-page-defaults/contracts/group-4.md
- [ ] 4.1 RED — vitest：`EditModeToggle` 开关展开口令输入；提交正确口令调用 login action（mock）并触发 refresh
- [ ] 4.2 GREEN — `EditModeToggle` 组件（开关 + 口令 + 调 login + refresh）
- [ ] 4.3 RED — vitest：错误口令渲染 `bad-password` 文案、不解锁；已登录态显示「已解锁·登出」
- [ ] 4.4 GREEN — 接 login 返回态渲染反馈；已登录分支
- [ ] 4.5 MOCK — open mock（④ 就地解锁）；note 口令输入 44px、解锁后绿条「已解锁编辑」、错误同登录文案
- [ ] 4.6 VISUAL DIFF — dev stack；未登录在排阵页开编辑模式→输密码解锁→保存/编辑控件出现（用 requestSubmit 触发 action）；桌面 + 375；量对比度、44px、无溢出；fix drift
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 5. 验证与交付

- [ ] 5.1 Run frontend test suite — `cd frontend && npm run test` 确保无回归
- [ ] 5.2 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [ ] 5.3 Run superpowers:verification-before-completion — 跑 test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config 的 custom_verification_checks；先测试→补种→视觉核对，中途不插 pytest；无 migration、无远程步骤
