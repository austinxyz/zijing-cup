# Tasks — opponent-compare

## 1. 对比组装（纯函数）

### Contract
- **Spec**: opponent-compare —— 「对比 SHALL 按规则线序逐线并排：每线显示我方两人（姓名+性别+该线当前 UTR 和）、对手两人、以及差距 = 我方线和 − 对手线和；底部两队总 UTR 和与其差」；「姓名与性别 SHALL 由各队 roster 按球员 key 解析」；「对比用当前值；某侧 status utr_moved/illegal/player_gone 标注；player_gone 不显示假总和」；「MUST NOT 判胜负/预测比分」。
- **Runtime**: `cd frontend && npm run test -- compare` → expected: 组装纯函数单测过（逐线配对、差、总和、status、缺线/缺人边界）；`npx tsc --noEmit` 干净。
- **Code**: 纯函数 `buildComparison(lineOrder, sideA, sideB)`（side = {savedLineup, byKey:Map<key,RosterPlayer>}）→ 逐线 rows + totals；UTR 差用 `Number(值字符串)` 相减**仅供显示**（两位小数、不回写、不判定），两侧该线都有 `line_totals[line].value` 才算差否则「—」；总和差同理（两侧 total 非 null）；`player_gone`→total null 不硬凑；姓名经 byKey 解析，缺 key→占位。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/opponent-compare/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 RED — `compare/compareBuild.test.ts`：两侧各一套阵容 + byKey，`buildComparison` 逐线返回两对（姓名+性别+线和）与差（我−对手）。断言失败（函数未定义）
- [x] 1.2 GREEN — 实现 `buildComparison`（逐线配对 + 姓名解析 + 线和/差）
- [x] 1.3 RED — 测底部总和 + 总和差；两侧 total 都在才算，缺则 null/「—」
- [x] 1.4 GREEN — 补总和/总和差
- [x] 1.5 RED — 测边界：某侧 `player_gone`（total null 不硬凑、标 status）、某线缺失（占位、差「—」）、缺 key（姓名占位）
- [x] 1.6 GREEN — 补 status/缺线/缺 key 处理
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/opponent-compare/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS else FIX + retry

## 2. /compare 页 + 选择器 + gate + 点亮侧栏

### Contract
- **Spec**: opponent-compare —— 「提供页面 `/[season]/[division]/compare`：两个『队+已存阵容』选择器…状态进 URL…某队无已存阵容空态…未选满引导空态」；「按 `canEdit(season,division)` gate：未解锁 MUST NOT 看到已存阵容、带到解锁入口/队伍页、无游客视图」。app-shell —— MODIFIED「应用壳提供侧栏导航」：「对手对比是可跳转的链接」指向 `/compare`。
- **Runtime**: `cd frontend && npm run test -- compare nav app-shell` → expected: 页面/选择器/gate/nav 单测过；`npx tsc --noEmit` 干净。
- **Code**: `compare/page.tsx`（server）读 searchParams→并发取 teams/rules + 每已选队 savedLineups+roster→`buildComparison`；`CompareControls`（client）两队+两阵容 select，改动 `router.push` 改 URL（改队清阵容 id），受控/按参数 key remount 防陈旧回填；起手 `canEdit` 否则 redirect；配 `compare/error.tsx`；`nav.ts` 的 opponents 项 `pending:false` + `href:${base}/compare`。名单实力对比不做。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/opponent-compare/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-06-opponent-compare-mocks.html；记 token 与文案（「我方」「对手」「线位」「差距」「总和」「选一支队…」空态、陈旧状态徽标、移动卡片）
- [ ] 2.2 RED — 测 `nav.ts`：opponents 项 `pending:false` 且 href 指向 `/{s}/{d}/compare`；测 Sidebar「对手对比」是链接不再未开放
- [ ] 2.3 GREEN — 改 `nav.ts` 点亮 opponents
- [x] 2.4 RED — 测 `/compare` page：未 canEdit 重定向；canEdit 且未选满出引导空态；选满两侧出逐线并排（getSavedLineups/getTeamRoster 走 mock）
- [x] 2.5 GREEN — 实现 `compare/page.tsx` + `CompareControls` + `compare/error.tsx`
- [x] 2.6 VISUAL DIFF — bring up dev stack；解锁本比赛；给同组两队各存一套阵容后开 /compare，比对逐线表 + 选择器 + 陈旧标注 + 空态与 mock；修 token/文案漂移
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + specs/opponent-compare/spec.md + specs/app-shell/spec.md + design.md + diff; review + score (threshold 70); ≥70 PASS else FIX + retry
- [x] 2.F1 FIX — TopNav.test.tsx: update line 65-71 test to expect link instead of disabled (match Sidebar.test.tsx changes)
- [x] 2.F2 AUDIT — CompareControls: verify soft-nav controlled-select sync or add key pattern

## 3. 验证

### Contract
- **Spec**: opponent-compare + app-shell 两份 delta 的全部 SHALL。
- **Runtime**: `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest` 全绿（后端未改，回归）+ 新源码无 console.log。
- **Code**: 交付后本地实测（补种真实 2025 数据 + 解锁该组 + 给同组两队各存一套阵容）：/compare 选两侧后逐线并排正确、差算对、总和差对；未解锁进不去；某队无阵容空态；侧栏「对手对比」可点。pitfall：先测→再补种→再视觉；本机后端裸 uvicorn 不带 --reload、改完杀进程重起。
- **Threshold**: 80

- [ ] 3.1 Run superpowers:verification-before-completion — 前端 vitest + tsc + 后端 pytest 回归 + console.log 审计全过；本地真实数据 e2e（两队各存阵容→/compare 逐线 + gate + 空态 + 侧栏链接）实测；修任何失败再收工
