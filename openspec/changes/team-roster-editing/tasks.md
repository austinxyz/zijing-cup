## 1. Schema + 外援上限规则存储 + seed

### Contract
- **Spec**: 规则按 division 存（如 `division_borrowed_limits(division_id, school_count, roster_cap, on_court_cap)`）并随 seed 灌入，可逐赛季/组别改数据而不改代码。`teams` SHALL 带一个可空的 `school_count`；`null` 表示未设。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "borrowed or school_count or rules"` → expected: 规则/学校数模型与 seed 测试通过，无 import 错误
- **Code**: D1 新 migration（`teams.school_count int null` + 表 `division_borrowed_limits`，`unique(division_id, school_count)`；文件以 `set search_path to zijing_cup, public;` 开头）；seed 2026 金+银 `(1,3,2)(2,2,1)(3,0,0)(4,0,0)`；本地打 127.0.0.1（断言连接串含 127.0.0.1），远程 Dashboard 手工、禁 CLI push。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/team-roster-editing/contracts/group-1.md; confirm 三字段非空
- [x] 1.1 RED — pytest：加载某 division 的外援上限规则 → 得到 school_count→(roster_cap,on_court_cap) 映射（2026 银 1→(3,2) 等）
- [x] 1.2 GREEN — 新 migration（teams.school_count + division_borrowed_limits）+ 模型 + seed；本地打库
- [x] 1.3 RED — pytest：Team 带 school_count，可空默认 null（非 0）
- [x] 1.4 GREEN — Team.school_count 字段 + 取队伍时返回
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3, plateau <5pt escalate)
  - **Result**: PASS (94/100: Spec 100, Runtime 100, Code 75)
  - **Finding**: [HIGH] drift-detection gap in load_rules._field_differences() — doesn't inspect borrowed_limits changes, affects incremental updates (not fresh seeding)

## 2. 后端写入：外援/外卡/代表学校、学校数、批量双打 UTR

### Contract
- **Spec**: 后端 SHALL 提供写入 membership 的 `is_borrowed_player`/`is_wildcard`/`representing_school`（按 (队员,队伍)，与五字段端点分开，方法判权保护）。`teams.school_count` 可由管理员写入。未锁季写当前双打 UTR SHALL 一并覆盖该赛季参赛 UTR（批量对每人应用同一规则）；已锁季只写当前值。无管理员凭据 SHALL 返回 403。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "membership or school_count or utr or auth"` → expected: 写入/覆盖/锁季/鉴权测试通过
- **Code**: D3 新 server 写路由（中间件自动保护）：(a) membership 三字段（与五字段端点分开，后端兜底 borrowed/wildcard 为真时 representing_school 应空）；(b) school_count 写；(c) 批量当前双打 UTR，逐条套 saveCurrentUtr 的「未锁季覆盖参赛值」。Decimal 全程。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/team-roster-editing/contracts/group-2.md
- [x] 2.1 RED — pytest：写 membership 外援/外卡/学校 → 读回新值；无管理员凭据 403
- [x] 2.2 GREEN — membership 写路由 + command
- [x] 2.3 RED — pytest：写 school_count → 读回；borrowed/wildcard 为真时 representing_school 被后端清空/拒
- [x] 2.4 GREEN — school_count 写 + representing_school 条件兜底
- [x] 2.5 RED — pytest：批量双打 UTR，未锁季覆盖参赛值 / 已锁季不覆盖
- [x] 2.6 GREEN — 批量双打 UTR 写（复用 saveCurrentUtr 覆盖逻辑）
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS; <80 FIX+retry
  - **Result**: PASS (98/100: Spec 100, Runtime 100, Code 90)
  - **Finding**: [MEDIUM] school_count lacks bounds validation (should reject negative/zero); 0 CRITICAL/HIGH; all contract SHALLs verified; 112/112 tests pass including 7 new team_editing tests

## 3. 引擎：外援上场校验 + borrowed_over_limit 归因

### Contract
- **Spec**: 搜索 SHALL 校验上场十人里外援数 ≤ on_court_cap(school_count)，超过的阵容 MUST NOT 作为候选；school_count 未设时不拦且 `borrowed_players_checked` 为 false，已设时校验并置 true；`is_wildcard` 不参与。外援超上限的无解 SHALL 以专门原因类型 `borrowed_over_limit` 呈现，点名外援与超出量。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "lineup and (borrowed or infeasib)"` → expected: 上场校验/未设不拦/归因 测试通过
- **Code**: D2 `load_roster` 把 membership.borrowed 读进 `Candidate`（一处，候选与已存阵容都经它）；搜索/过滤阶段统计上场外援数 vs on_court_cap；null→跳过、`borrowed_players_checked` 随之；`diagnose_line`/infeasibility 加 `borrowed_over_limit`，点名用 `_display_name`（避免 tab 拼接）。
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/team-roster-editing/contracts/group-3.md
- [ ] 3.1 RED — pytest：Candidate 带 borrowed；上场外援数超 on_court_cap 的阵容被排除
- [ ] 3.2 GREEN — load_roster 带 borrowed + 上场外援校验
- [ ] 3.3 RED — pytest：school_count 未设 → 不拦、borrowed_players_checked=false；已设→true
- [ ] 3.4 GREEN — null 跳过 + borrowed_players_checked 落地
- [ ] 3.5 RED — pytest：外援超限无解 → infeasibility 原因 borrowed_over_limit 点名外援
- [ ] 3.6 GREEN — diagnose 加 borrowed_over_limit
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS; <80 FIX+retry

## 4. 队伍页编辑模式 + 批量双打 UTR + 外援/外卡/学校/学校数

### Contract
- **Spec**: 队伍页 SHALL 提供「编辑模式」开关就地输口令解锁（复用登录 action、同款反馈、方法判权仍保护），只读用户 SHALL NOT 见编辑控件。当前双打 UTR SHALL 可就地批量输入、一个保存提交、改动格有标记、沿用锁季覆盖语义。SHALL 可改 is_borrowed_player/is_wildcard、（条件）representing_school、school_count；外援/外卡行学校控件禁用；名单外援超 roster_cap 保存**警告放行**；school_count 驱动上限提示。
- **Runtime**: `cd frontend && npm run test` → expected: 队伍页编辑组件测试 + 既有 roster 测试无回归 全通过；`npx tsc --noEmit` 干净
- **Code**: D4 `teams/[code]` 挂 `EditModeToggle`（复用，signedIn=canEdit）；`RosterTable`/`RosterEditor` 编辑态批量双打输入 + 外援/外卡勾选 + 代表学校下拉（borrowed/wildcard→disabled）+ school_count 头部输入 + 保存/警告；只读不渲染控件；roster 取数扩 school_count + per-player borrowed。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/team-roster-editing/contracts/group-4.md
- [ ] 4.1 RED — vitest：EditModeToggle 在队伍页解锁流程（复用组件，signedIn 分支）；只读态无输入框
- [ ] 4.2 GREEN — 队伍页挂 EditModeToggle + 只读/编辑态切换
- [ ] 4.3 RED — vitest：批量双打输入改多格 → 一个保存调批量 action；改动格有标记
- [ ] 4.4 GREEN — RosterTable 批量双打输入 + 保存条
- [ ] 4.5 RED — vitest：勾外援/外卡 → 该行学校下拉 disabled；名单外援超 roster_cap → 警告仍可存；school_count 改动显示上限
- [ ] 4.6 GREEN — 外援/外卡/学校/学校数控件 + 警告 + 上限提示
- [ ] 4.7 MOCK — open docs/superpowers/specs/mocks/2026-09-04-team-roster-editing-mocks.html（① 编辑表 + Save 条 + 学校数 + 条件学校）；note 覆盖提示串、禁用态、警告态
- [ ] 4.8 VISUAL DIFF — dev stack（补种 + 造 school_count/外援数据）；admin 解锁队伍页对照 mock ①（批量双打改+存、外援/外卡勾选、外援行学校禁用、学校数上限提示、名单超限警告）；桌面 + 375；量对比度 ≥4.5、44px、无横向溢出；fix drift
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥70 PASS; <70 FIX+retry

## 5. 候选/已存阵容外援配色

### Contract
- **Spec**: 候选与已存阵容三行块里外援队员 SHALL 用可辨颜色/标记区分，不与 ♂/♀ 及估算标记混淆；桌面与 375 对比度 ≥4.5、不横向溢出；是否外援取自后端字段，前端只显示。
- **Runtime**: `cd frontend && npm run test` → expected: LineBlock 外援标记测试、候选/已存阵容传 borrowed、contrast 含外援 token 全通过；`npx tsc --noEmit` 干净
- **Code**: D5 `LineBlock` seat 加 `borrowed`，外援 seat 用新 token（`--color-borrowed-surface` 等，量 ≥4.5:1 进 globals.contrast.test.ts）；`CandidateCards`/`SavedLineups` seat 构造传后端 borrowed；`lib/api.ts` 候选/已存阵容 per-player 加 `is_borrowed_player`、`borrowed_over_limit` 收进 infeasibility literal union。
- **Threshold**: 70

- [ ] 5.0 CONTRACT — write openspec/changes/team-roster-editing/contracts/group-5.md
- [ ] 5.1 RED — vitest：LineBlock 外援 seat 带可辨标记（class/角标），普通 seat 无
- [ ] 5.2 GREEN — LineBlock borrowed seat + token
- [ ] 5.3 RED — vitest：候选（CandidateCards）与已存阵容（SavedLineups）把后端 borrowed 传进 seat
- [ ] 5.4 GREEN — 两处 seat 构造传 borrowed
- [ ] 5.5 RED — vitest：globals.contrast.test.ts 外援 token 对其底色 ≥4.5:1
- [ ] 5.6 GREEN — 调外援 token 至达标
- [ ] 5.7 MOCK — open mock（② 三行块外援标记）；note 底色条/角标、与 ♂/♀·估算不撞
- [ ] 5.8 VISUAL DIFF — dev stack；搜出含外援候选 + 已存阵容，对照 mock 外援标记；桌面 + 375；量对比度 ≥4.5、无横向溢出；fix drift
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥70 PASS; <70 FIX+retry

## 6. 验证与交付

- [ ] 6.1 Run backend + frontend test suites — `cd backend && ./.venv-std/Scripts/python.exe -m pytest` 与 `cd frontend && npm run test` 无回归
- [ ] 6.2 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [ ] 6.3 Run superpowers:verification-before-completion — test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config custom_verification_checks；migration 本地已打、远程 Dashboard 待手工（记进交付说明）；顺序：先测试→补种→视觉核对，中途不插 pytest
