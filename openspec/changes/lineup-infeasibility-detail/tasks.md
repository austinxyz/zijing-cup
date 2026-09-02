## 1. 后端：无解那条线的结构化诊断

### Contract
- **Spec**: 无解那条线，系统 SHALL 一并给出**为什么这条线的候选池为空**的结构化诊断，覆盖客观原因（性别组合人手不足 / 都超 cap / 都超搭档差距 / 资格线限制），可并存全部据实列出，MUST NOT 只挑一个猜「主因」。诊断 SHALL 是**只读**的候选池分析，MUST NOT 触发第二次整解搜索，MUST NOT 声称是哪一条锁定导致了无解。诊断 SHALL 在可直接读出时归因到用户动作（排除、锁进别线），点名队员及去向；归因 MUST 仅针对排除与锁进别线，资格/cap/搭档差距 MUST NOT 归因成用户造成。数值 SHALL 以字符串形式给出。
- **Runtime**: `cd backend && uv run pytest tests/lineups/` → expected: 每类原因的最小无解场景测试通过、既有 lineups 测试无回归、无 import 错误
- **Code**: D1 独立 `Infeasibility`/`InfeasibilityReason`/`PlacedPlayer` 结构，不复用 `Violation`；`infeasible_line` 保留、`infeasibility.line` 同值。D2 新 `diagnose_line(rules, rule, available, placements)` 用与 `legal_pairs` 相同的 `available` 池与四关判定，一趟 `combinations`、无第二次搜索。D3 归因只挂 `gender_shortage`、只读 `placements` 里 `where != 本线` 的同性别队员；`over_cap`/`over_gap`/`eligibility` 的 `attributed` 恒空、中性措辞。资格判定只报可局部判定的 `restricted_to_lines` 事实。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/lineup-infeasibility-detail/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — pytest：WD 需 2 名女、可用只 1 名的最小场景，断言 `result.infeasibility.reasons` 有一条 `kind=="gender_shortage"`、message 含「需要 2」「可用只 1」
- [x] 1.2 GREEN — 加 `Infeasibility`/`InfeasibilityReason`/`PlacedPlayer` dataclass + `SearchResult.infeasibility` 字段；`diagnose_line` 实现 gender_shortage 分支；`search()` 在返回 `infeasible_line` 前组装 `infeasibility`
- [x] 1.3 RED — pytest：能凑出组合但每对都超 cap+buffer 的场景，断言有一条 `kind=="over_cap"`、message 含 cap 值
- [x] 1.4 GREEN — `diagnose_line` 加「遍历 slot-ok 对、记第一个失败关」逻辑，产出 `over_cap` 原因
- [x] 1.5 RED — pytest：每对都超搭档差距的场景，断言有一条 `kind=="over_gap"`
- [x] 1.6 GREEN — `diagnose_line` 产出 `over_gap` 原因
- [x] 1.7 RED — pytest：够格的人被 `restricted_to_lines` 挡在本线外的场景，断言有一条 `kind=="eligibility"` 且该原因 `attributed == []`（不归因到用户）
- [x] 1.8 GREEN — `diagnose_line` 产出 `eligibility` 原因，中性措辞，`attributed` 恒空
- [x] 1.9 RED — pytest：WD 缺的女将正是被排除 + 锁进 MD 的人，断言 `gender_shortage.attributed` 点名两人、`where` 分别为 `"excluded"` 与 `"MD"`
- [x] 1.10 GREEN — `diagnose_line` 的 gender_shortage 从 `placements` 填 `attributed`（只取 `where != 本线` 的同性别）
- [x] 1.11 RED — pytest：无解但非用户造成（人本身对 cap 太强）的场景，断言 `over_cap.attributed == []`；并断言 `diagnose_line` 不调用整解搜索（不出现第二次 `search_lineups`/因果字段）
- [x] 1.12 GREEN — 确保 cap/gap/eligibility 三类 `attributed` 恒空；诊断路径只读候选池
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：NoSolution 呈现原因 + 归因

### Contract
- **Spec**: 无解那条线，页面 SHALL 呈现后端给出的结构化原因（多因并存都呈现），取代光秃秃的「没有任何合法搭档」；后端给出归因时页面 SHALL 点名队员及去向。页面 MUST 说明去向是读取当前输入的结果，MUST NOT 呈现为「是这条锁定导致了无解」，也 MUST NOT 把资格/cap/差距呈现为用户造成。无解面板 SHALL 显式给自己底色，对比度 SHALL ≥ 4.5:1（computed style 实测），桌面与 <768 都读得清、不横向溢出。数值 SHALL 原样取自后端字符串，MUST NOT 拿显示值做比较。
- **Runtime**: `cd frontend && npm run test` → expected: NoSolution 新测试通过（含 token 断言、归因点名、资格不归因）、既有 LineupStates 测试无回归
- **Code**: D4 `lib/api.ts` 的 `LineupSearch` 加 `infeasibility?` 类型（reasons: {kind, message, attributed:{name,where}[]}[]）。`NoSolution` 有 `infeasibility` 则渲染原因列表 + 归因 chips（[mocks.html](mocks.html)：warning `#8a6508`/`#fbf5e6`、资格中性 `#6b665d`/`#f2efe9`、排除 danger `#b3261e`），无则退回现有 placements 呈现；既有免责声明句保留。固定渲染顺序人手→cap→差距→资格。前端不做数值比较。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-infeasibility-detail/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-01-lineup-infeasibility-detail-mocks.html; note linear tokens (warning `#8a6508`/`#fbf5e6`/`#ecd9a4`, 资格中性 `#6b665d`/`#f2efe9`, danger `#b3261e`) and verbatim strings（「为什么这条线凑不出」「少的女队员现在在哪」等）
- [ ] 2.2 RED — vitest：给 `NoSolution` 传含 gender_shortage + attributed 的 `infeasibility`，断言渲染出原因 message、点名队员与去向、且 `wrapper.classes()`/className 含 warning token；断言免责声明句仍在
- [ ] 2.3 RED — vitest：传 eligibility 原因，断言渲染中性档、且不出现任何「你的锁/排造成」措辞（attributed 为空 → 不渲染归因 chips）
- [ ] 2.4 GREEN — `lib/api.ts` 加 `infeasibility?` 类型；`NoSolution` 渲染原因列表 + 归因 chips，退回逻辑保留，免责声明保留
- [ ] 2.5 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`); 造一个无解场景导航到排阵页; eyeball against mock; 量 computed style 确认对比度 ≥ 4.5:1、桌面与 375 都不横向溢出、fix any token/color/text drift
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与交付

- [ ] 3.1 Run backend test suite — `cd backend && uv run pytest`（本机用 `backend/.venv-std/Scripts/python.exe -m pytest`）确保无回归
- [ ] 3.2 Run frontend test suite — `cd frontend && npm run test` 确保无回归
- [ ] 3.3 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [ ] 3.4 Run superpowers:verification-before-completion — 跑 test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config 的 custom_verification_checks；补种前不再跑 pytest（先测试→补种→视觉核对）
