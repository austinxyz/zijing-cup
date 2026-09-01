# Eval Log — lineup-results-redesign

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 — 桌面对比表（1.6 VISUAL DIFF 实测）

1280×800 /lineup/USTC-CMU-HQU（20 套）：表 8 列（#/总和/buffer/D1/D2/D3/MD/WD）、20 行、可见、无横向溢出；D1 列跨行左边缘对齐；表头滚动 400px 后钉住（sticky top:0）；名字 white-space:nowrap；main 内对比度 0 不合格、最低 4.87。
估算/超cap 标记线上 2025 银组触发不了（frozen、buffer 0），由 vitest 覆盖（˟ title=估算值 + 估 badge title=完整句 + 图例；超 N 红）。
LineupResults 候选段换成 CandidateTable；helper 抽到 candidate.ts（estimatesIn/money/overOf/isEstimate/estimateSentence）；旧 CandidateCard 退役。既有估算测试按新呈现改（估算字→title、整句→badge title/图例），page 测试改到表 DOM。全套 vitest 363 通过、tsc 干净。

### Group 1 — Attempt 1

**Evaluation Date:** 2026-09-01

**Scores:**
- Spec Compliance: 90/100
- Runtime: 100/100
- Code Quality: 88/100
- **Total: 94/100**

**Status:** PASS (94 ≥ 70)

**Findings:**

**SPEC COMPLIANCE (90/100):**
- ✓ Table structure: 8 columns (#/总和/buffer/D1-D5), real `<table>` with `table-fixed`
- ✓ Row per candidate in backend order (tested: 13.00, 12.80, 12.60)
- ✓ Cross-row alignment: `<colgroup>` with fixed widths ensures D1 column alignment
- ✓ Name truncation: `whitespace-nowrap` + `overflow:hidden` (verified in test + visual diff)
- ✓ No horizontal scroll: `w-full table-fixed` constrains width (verified 1280px viewport with 20 rows)
- ✓ Sticky header: `position:sticky top:0 z-10` on `<th>` elements (verified scrolls to row 20)
- ✓ Scroll container: Wrapper div has `overflow-y-auto`, parent has `overflow-hidden`
- ✓ Estimate markers: Per-number `˟` (title="估算值") + per-set `估` badge (title=full sentence)
- ✓ Legend: Shows full text "˟ 名字後 = 该数字是估算值" + "估 总和旁 = 整套含估算值，合法性待总表确认"
- ✓ Gender display: Name component shows GENDER_LABEL[M|F] or fallback "—"
- ✓ Over-cap marking: `overOf()` returns null if ≤0, renders `<span className="text-danger"> 超 {over}</span>`
- ✓ Buffer display: `{money(spent)}/{money(total)}` shows two decimal places
- ✓ Contrast: Visual diff verified 0 failures, minimum 4.87:1 ✓
- ⚠ Open lines (cap=null): Spec requires showing "無上限", no explicit code found, but not in 2025 test data and visual eval passed

**RUNTIME (100/100):**
- ✓ All 101 tests pass (0 failures)
- ✓ New desktop table tests:
  - "renders candidates as a table with a column per line" → Table role + columnheaders check
  - "gives one body row per candidate, in the backend order" → 3 rows with 13.00/12.80/12.60 order
  - "keeps player names on a single line (no wrap)" → className includes nowrap|truncate
- ✓ Page integration tests updated and passing
- ✓ No regressions in existing lineup tests

**CODE QUALITY (88/100):**
- ✓ TypeScript: Compiles cleanly, `npx tsc --noEmit` produces no errors/warnings
- ✓ Structure: Real `<table>` with proper `<colgroup>`, `<thead>`, `<tbody>`
- ✓ Logic extraction: Pure functions in candidate.ts (estimatesIn, money, overOf, isEstimate, estimateSentence) reusable by both desktop/mobile
- ✓ Accessibility: Title attributes on all estimate markers (˟ and 估 badge)
- ✓ React patterns: Clean component composition (PairName, Name, Th, Td helpers)
- ✓ Edge cases: Null checks (`!pair || !lt` → "—"), fallback gender ("—")
- ✓ Comments: Design decisions explained (why real table, why sticky+scroll, why legend)
- ✓ No console.log statements
- Minor: Open line case not explicitly handled (same uncertainty as spec)

## Group 1 — 迟到嵌套 code-review 的 HIGH（PASS 后照读修复）
打分 EVAL 已 PASS(94)，但其内部 code-review 迟到报了一条 HIGH：contract D1 明写长名要带 `title` 全名，实现只加了 `truncate` class、名字格无 title —— 长名截断后找不回。已修：CandidateTable 名字格加 `title={A · B}`；补一条 vitest 断言名字格 title 含两名全名（先红后绿）。顺带 LOW：测试里中途 import 挪到文件顶部。MEDIUM（手机暂无候选列表）是 group 2 下一步、同会话不单独发，不改。全套 364 通过、tsc 干净。

## Group 2 — 手机紧凑行 + 展开（2.6 VISUAL DIFF 实测）

375×667 /lineup/USTC-CMU-HQU（20 套）：candidate-rows 列表可见（20 行）、桌面表隐藏、无横向溢出；首行签名「1 · 55.94 · D1 Cai Zesheng · Liu Jiada」。点开：candidate-lines 5 条线纵向、对比度 0 不合格 最低 4.87、无横向溢出。含估算/超cap 角标由 vitest 覆盖（线上 2025 触发不了）。
新建 CandidateRow（client，useState 展开），复用 candidate.ts 判定纯函数（+hasOver）；LineupResults 同时渲染 CandidateTable(hidden md:flex) 与 CandidateRows(md:hidden)。全套 369 通过、tsc 干净（UtrPanel 一条 waitFor 间歇，单跑绿，与本次无关）。

### Group 2 — Attempt 1

**Evaluation Date:** 2026-09-01

**Scores:**
- Spec Compliance: 65/100
- Runtime: 100/100
- Code Quality: 70/100
- **Total: 80/100**

**Status:** PASS (80 ≥ 70)

**Findings:**

**SPEC COMPLIANCE (65/100):**
- ✓ Compact row rendering: rank + total + D1 signature present and aligned
- ✓ Cost flags in collapsed state: "含估算" and "超 cap" badges render correctly
- ✓ Expand/collapse mechanism: works with pure local `useState`, `aria-expanded` correct
- ✓ Collapse view layout: 375px shows signature with truncate + nowrap
- ✓ Expand view shows five lines: all five rule lines render vertically
- ✓ Names don't wrap in collapsed: `truncate whitespace-nowrap` on D1 signature
- ⚠ Names in expanded lines lack truncation: `whitespace-nowrap` only (no `truncate`/`overflow-hidden`), can overflow at 375px with longest names
- ✗ **Buffer display completely missing from expanded view** — MODIFIED spec requires "buffer 与额度" on every candidate display; desktop table shows `{spent}/{total}`; contract explicitly requires "buffer...手机展开态也要有" (buffer in mobile expanded state). Currently not rendered anywhere in `CandidateRow`.
- ✓ Scrolls to end: `overflow-y-auto` on container
- ✓ No horizontal overflow in collapsed: correct layout

**RUNTIME (100/100):**
- ✓ All 56 tests pass (`app/[season]/[division]/lineup/` suite)
- ✓ Compact row test: renders rank, total, D1 signature
- ✓ Flags test (estimate + over-cap): both badges work
- ✓ Expand test: correctly expands/collapses with `aria-expanded`
- ✓ Five lines in expanded: all line codes and totals render
- ✓ No regressions in desktop table (Group 1) tests

**CODE QUALITY (70/100):**
- ✓ D2 (separate DOM): `md:hidden` on mobile rows, `hidden md:flex` on desktop table, mutually exclusive
- ✓ D3 (function reuse): `estimatesIn`, `isEstimate`, `overOf`, `estimateSentence`, `hasOver`, `GENDER_LABEL` all imported from shared `candidate.ts`
- ✓ Expand/collapse: pure local state with `useState`, no external dependencies
- ✓ Accessibility: `role="list"` on wrapper, `aria-expanded` on toggle, proper semantic HTML
- ✓ TypeScript: Compiles cleanly, proper types on all props/functions
- ✓ Comments: Design decisions documented
- **HIGH: Buffer display missing entirely.** Desktop table shows `{money(spent)}/{money(total)}` in every row; mobile expanded view shows five lines but no buffer. `CandidateRows` receives no `bufferTotal` prop and never calls `money()` for buffer rendering.
- MEDIUM: Expanded pair-name lines in the stacked view use only `whitespace-nowrap` (no `truncate`), which keeps text on one line but doesn't clip it — can overflow row at 375px with long names. Desktop table pairs `truncate` with `nowrap` for this case. No vitest covers long names in *expanded* mobile state (only desktop truncation test exists).
- MEDIUM: D1 signature lookup uses positional assumption (`candidate.lines[lineOrder[0]]`), not explicit `"D1"` key. If rule order changes, signature silently shows wrong line.
- LOW: Cost-flag badges render at `text-[9.5px]`, smallest text on the row; visual check at real 375px recommended for legibility.
- LOW: No negative-case test (all frozen values, no flags) — suite covers compact/expand/flags but not a clean row.

**VISUAL DIFF READINESS:**
- Contract expectations (from prompt): 20-row compact list ✓, desktop hidden at 375px ✓, D1 per row ✓, expand to 5 lines ✓, no H-overflow ✓, contrast checked ⚠ (badge size borderline per code review).
- **Open:** Buffer column in expanded state was not in the visual-diff test plan but IS in the spec and contract; cannot verify visually until code adds it.

## Summary

Implementation successfully delivers the mobile compact-row UI with expand/collapse and cost flags — all four contracted scenarios pass in vitest and the DOM structure is sound. However, **buffer usage display is entirely absent from the mobile view**, which violates an explicit MODIFIED spec requirement ("every candidate SHALL display buffer") and group 2's own contract statement ("buffer...手机展开态也要有"). This is a spec-named gap (HIGH severity per code review). Secondary issues: expanded line names lack overflow truncation (MEDIUM), and D1 lookup is positional rather than explicit (MEDIUM). Total score 80 is above threshold (70) due to solid runtime coverage and 3 of 4 main UI features working, but **buffer gap must be fixed before merge** — it is a contractual omission, not merely a polish item.

## Group 2 — attempt 1 报了 HIGH（PASS 80 但按纪律修）
打分 EVAL PASS(80≥70)，但 findings 含 1 HIGH：手机展开态缺 buffer（合约明写「buffer…手机展开态也要有」）。按「有 HIGH 当 BLOCK」修：
- HIGH：CandidateRows 加 bufferTotal（从 LineupResults 传），展开面板顶部渲染 `buffer spent/total`（复用 money）。补 vitest：展开态含「0.00/0.50」。实机 375 复核：展开显示「buffer 0.00/0.00」+ 五线（2025 银组 bufferTotal=0.00 属实）。
- MEDIUM：展开五线名字加 truncate + min-w-0（防 375 长名溢出）；D1 签名改 `lines["D1"] ?? lineOrder[0]`（不再纯位置）。
- LOW：代价角标 9.5px→10px；补 all-frozen 无角标测试。
全套 371 通过、tsc 干净。

### Group 2 — Attempt 2

**Evaluation Date:** 2026-09-01

**Scores:**
- Spec Compliance: 98/100
- Runtime: 100/100
- Code Quality: 96/100
- **Total: 98/100**

**Status:** PASS (98 ≥ 70, no CRITICAL/HIGH)

**Findings:**

**SPEC COMPLIANCE (98/100):**
- ✓ Compact row rendering at 375px: rank + total + D1 signature, name no-wrap
- ✓ Cost flags in collapsed view: "含估算" + "超 cap" badges render correctly
- ✓ **Buffer display in expanded panel (PRIOR HIGH FIXED):** Line 131-133 shows `buffer {money(spent)}/{money(total)}` at top of expanded section
- ✓ Expanded view shows five lines vertically with `truncate whitespace-nowrap` on names (fixes MEDIUM: prevents overflow at 375px)
- ✓ D1 signature explicit lookup: `candidate.lines["D1"] ? "D1" : lineOrder[0]` (fixes MEDIUM: not positional)
- ✓ Expand/collapse mechanism: `useState` local state, `aria-expanded` attribute correct
- ✓ No horizontal overflow at 375px: `md:hidden` class, container has `overflow-y-auto`
- ✓ All MODIFIED spec signals present: gender display (Name component), estimate marker glyph `˟` with title, over-cap marking, buffer display
- ✓ All scenario tests pass (vitest)

**RUNTIME (100/100):**
- ✓ All 58 tests pass (`app/[season]/[division]/lineup/` suite)
- ✓ New buffer test passes: "shows buffer spent/total in the expanded panel" (line 301-307) — expects "0.00/0.50" in panel
- ✓ New all-frozen test passes: "puts no cost flag on an all-frozen, within-cap candidate" (line 309-314) — expects no "含估算" or "超 cap" badges
- ✓ Compact/expand/collapse tests all passing
- ✓ D1 signature rendering correctly (tests verify first pair renders)
- ✓ No regressions in group 1 (desktop table) tests

**CODE QUALITY (96/100):**
- ✓ CandidateRows component properly accepts `bufferTotal` prop and threads it to expanded panel
- ✓ Pure function reuse from candidate.ts: `estimatesIn`, `hasOver`, `isEstimate`, `estimateSentence`, `money`, `overOf`, `GENDER_LABEL` — consistent with D3 (shared logic, separate DOM)
- ✓ Expand/collapse is pure local `useState`, no external side effects
- ✓ D2 compliance: mobile DOM is separate (`md:hidden` on rows, implicit `hidden md:flex` on desktop table), not responsive-wrapped version
- ✓ Accessibility: `role="list"`, `aria-expanded`, `title="估算值"` on estimate glyphs, semantic HTML (`<li>`, `<button>`)
- ✓ TypeScript: clean compilation, explicit types on all props
- ✓ No console.log statements, comments explain design decisions (D1 fallback, why separate DOM)
- ✓ Cost flags now at `text-[10px]` (improved from 9.5px)
- Minor (96 not 100): Comments could be slightly more explicit about `min-w-0` enabling truncate to work in flex layout, but the code is correct

**VISUAL DIFF READINESS:**
- 375px viewport: compact row visible, 20 rows scrollable, no H-overflow ✓
- Expand: shows buffer (0.00/0.50 expected per 2025 test data), five lines, no H-overflow ✓
- Estimate/over-cap flags visible in compact state ✓
- Names properly truncated in expanded lines ✓

**Summary:**
All prior HIGHs and MEDIUMs fixed. Buffer display is now fully present in expanded panel (line 131-133). D1 signature uses explicit key lookup (`lines["D1"] ?? fallback`) instead of positional index. Expanded line names have both `truncate` and `whitespace-nowrap` to prevent overflow at 375px. New tests verify buffer display and all-frozen no-flags case. All 58 tests pass, TypeScript clean, no CRITICAL or HIGH issues identified. Code quality excellent, sharing pure judgment functions with desktop table per D3. Ready for merge.

## Group 3 — 验证与交付
3.1 前端 vitest 371 通过。3.2 tsc --noEmit 干净。3.3 后端 pytest 440 通过（本次不动后端，无连带损伤）；跑完补种（规则→名单→队名→清 players→migrate，17 未裁决）。
3.4 对比度终检：1280 排阵页 483 节点 0 不合格 最低 4.87；375 紧凑行+展开态 131 节点 0 不合格 最低 4.87；均无横向溢出。
3.5 回归：摘要区（可达上限 region + squads 行）、手机约束条（改约束）、非正常态面板未受影响 —— 只候选区版式变了。
迟到嵌套 review 的一条 a11y polish（展开按钮缺 aria-controls）也补了（+ id 面板）。
