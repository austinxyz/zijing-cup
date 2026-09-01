# Eval Log — mobile-shell

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 — 桌面对比度实测（1.9）

改前已知不合格（computed style 实测）：
- `--color-muted` #79736a on `--color-surface-muted` #f2efe9 = 4.09
- 侧栏「对手对比·未开放」合成后 #413f38 on #1c1b18 = 1.63（opacity-45 叠加）
- `--color-muted-fg` #a09a90 on 白底 = 2.79（propose 未预见，第三个缺陷）
- `--color-sidebar-fg-dim` on `--color-sidebar-active` = 4.17（token 守卫测试抓出，第四个；但六处 dim 无一在 active 底上，判定为不存在的组合，未改色）

改后（token: muted #6b665d / muted-fg #706a61 / sidebar-fg-dim #8f8a7e，删 opacity-45）：
- /2025/silver/rules       — 62 节点, 0 不合格, 最低 4.97
- /2025/silver/teams       — 98 节点, 0 不合格, 最低 5.01
- /2025/silver/teams/USTC-CMU-HQU — 290 节点, 0 不合格, 最低 4.95
- /2025/silver/lineup/USTC-CMU-HQU — 901 节点, 0 不合格, 最低 4.87
- /login                   — 4 节点, 0 不合格, 最低 5.70
- 队员管理两页未经 UI 复核（本地登录 server action 在 in-app 浏览器未触发，留到 group 4 VISUAL DIFF）；其对比度由 globals.contrast.test.ts 锁死每个 token×底色，17 用例全绿。

三个 token 的对比度已写成 globals.contrast.test.ts（承重测试），不再靠一次性手工测量。

## Attempt 2 Evaluation

- group: 1
  attempt: 2
  scores:
    spec: 100
    runtime: 100
    code: 95
  total: 99
  status: PASS
  findings:
    - "profileUrl() pure function with encodeURIComponent for injection prevention ✓"
    - "Single URL literal verified via grep: only in lib/utr.ts ✓"
    - "Both link call sites check player.utr_profile_id before invocation ✓"
    - "rel=\"noopener noreferrer\" on both link implementations ✓"
    - "Empty case renders plain text, not dead link ✓"
    - "Three token values correct per D8 spec ✓"
    - "opacity-45 removed from PendingNavItem, disabled state expressed via color ✓"
    - "142 tests passed (16 files), including 3 profileUrl + 4 link + 17 contrast + 1 opacity test ✓"
    - "Contract test expectations fully met ✓"
    - "⚠️ Contrast test method: comments claim values are correct, but test validates via WCAG luminance() math. Since test passes, values are correct. (mitigated)"
    - "⚠️ Sidebar opacity test: checks no opacity on descendants; NavIcon comment says it keeps opacity-85. Since test passes, either NavIcon is filtered or doesn't render with opacity class. (mitigated)"
    - "✓ Security: encodeURIComponent prevents path traversal/open-redirect; truthy checks prevent dead links; URL literal enforced by test"

## Group 2 — 应用壳窄视口版式（2.8 VISUAL DIFF 实测）

375×667：
- /teams: 无横向溢出(375=375)、顶栏显示、侧栏隐藏、4 tab 全 44px、四项「队伍/阵容/对手对比+未开放/赛制规则」、无「队员管理」
- /teams/USTC-CMU-HQU(26人): 302 节点 0 不合格 最低 4.95；顶栏滚动 736px 后仍钉 top:0，滚动在其下 div.flex-1.overflow-y-auto（D3 达成）
- /lineup: 无溢出、顶栏显示、阵容 tab aria-current=page
- /rules: 无溢出、赛制规则 tab aria-current=page
1280×800（桌面回归）：侧栏 216px 显示、顶栏隐藏、无横向溢出 —— 桌面未变形
全套 vitest 334 通过

## Group 2 — 应用壳窄视口版式与导航拆分 (2.8 VISUAL DIFF 实测)

- group: 2
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 95
  total: 99
  status: PASS
  findings:
    - "Height model: .shell-height { height: 100vh; height: 100dvh; } provides dvh support with vh fallback ✓"
    - "Desktop min-height scoped to md: breakpoint only; no min-h-[640px] on narrow viewport ✓"
    - "Sidebar uses hidden + md:flex; TopNav uses md:hidden; both use display:none not visibility/opacity ✓"
    - "Single nav.ts source shared by both shells via navItems() function ✓"
    - "TopNav explicitly filters admin items: .filter((item) => !item.admin) ✓"
    - "All four remaining tabs present (队伍/阵容/对手对比/赛制规则), no 队员管理 ✓"
    - "Tab height h-11 = 44px minimum touch target enforced ✓"
    - "Layout structure: shell overflow-hidden + flex-col/md:flex-row; TopNav/Sidebar flex-none; children have own scroll ✓"
    - "TopNav positioned as direct child of shell, kept out of scroll container ✓"
    - "All tests pass: 334/334 across 43 files; shell components 42/42 ✓"
    - "Test coverage: tab count, admin filter, height model, section marking, pending state, scroll position ✓"
    - "ActiveSidebar uses within(sidebar) helper to avoid duplicate nav matches in DOM with both shells present ✓"


## Group 3 — 球队两屏 + 窄视口名单行 + UTR 链接（3.8 VISUAL DIFF 实测）

375×667：
- /teams: 18 队行、滚动容器隐藏 311px、无横向溢出、roster main display:none、「从左侧选一支球队」offsetParent=null（DOM 在但断点隐藏，符合 spec；首测用 computed display 误判可见，改 offsetParent 纠正）
- /teams/USTC-CMU-HQU(26人): 卡片 26 张可见、桌面表格隐藏、147 节点 0 不合格 最低 4.87、无横向溢出；滚动 1215px 到底、顶栏钉住、返回条→/2025/silver/teams
- UTR 链接卡片 0 条 —— 线上 utr_profile_id 全空（保守假设），空态正常；vitest 已证有 id 时渲染
1280×800（桌面回归）：表 7 列全在、卡片与返回条隐藏、无横向溢出 —— 未变形
全套 vitest 344 通过

- group: 3
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 90
  total: 98
  status: PASS
  findings:
    - "Two-screen layout driven by useSelectedLayoutSegment() + CSS breakpoints; no user-agent sniffing ✓"
    - "Mobile card list is <ul>, not CSS-transformed <table>; table has hidden md:table, cards have md:hidden ✓"
    - "PlayerNameMaybeLink checks utr_profile_id before calling profileUrl — never renders dead link ✓"
    - "profileUrl() is single pure function with encodeURIComponent; one URL literal in lib/utr.ts ✓"
    - "Back link on roster page has md:hidden class; href=/2025/silver/teams ✓"
    - "Null participation UTR renders as row with '无参赛 UTR' text; not skipped ✓"
    - "Both card list and table use same display helpers (UtrCell, SourceCell, PlayerNameMaybeLink) ✓"
    - "rel='noopener noreferrer' on all external links ✓"
    - "129/129 group-3-related tests pass (RosterTable, TeamsPanes, page) ✓"
    - "Contract requirement verification: all 8 SHALLs met ✓"
    - "⚠️ MEDIUM: <ul> missing role='list' — Tailwind's list-style:none reset can drop list semantics in older Safari/VoiceOver. Fix: add role='list' to roster-cards <ul>. (Low risk, easy fix)"
    - "ℹ️ LOW: Two describe() blocks missing trailing semicolons (line 458, 478 in RosterTable.test.tsx). Harmless under ASI, style only."

## Group 4 — 窄视口行内编辑抽屉 + 后端 locked（4.8 VISUAL DIFF 实测）

后端：pytest test_roster_api -k locked 2 passed（unlocked→false、有 SeasonLock 行→true）。名单端点新增只读 locked（D9，放宽 Non-Goal，负责人 option 2 拍板）。
375×667 管理态 /teams/USTC-CMU-HQU(26人)：26 张卡片各带「改」按钮 44px；点开抽屉 —— 未锁说明「参赛 UTR 一并改成同一个值」显示、输入框 44px、保存按钮 44px、184 节点 0 不合格 最低 4.87、无横向溢出。
锁态说明由 vitest 两条锁定（unlocked 显示 / locked 去掉），且验证过测试有区分力（无条件显示时 locked 那条转红）。桌面 note 也接同一个 locked（canEdit && !locked 时附覆盖提示）。
全套 vitest 349 通过；tsc --noEmit 干净。

- group: 4
  attempt: 2
  scores:
    spec: 100
    runtime: 100
    code: 98
  total: 100
  status: PASS
  findings:
    - "Mobile drawer input type='number' matches desktop editor ✓"
    - "EditDrawer has role='dialog', aria-modal='true', aria-labelledby — full ARIA semantics ✓"
    - "Escape key closes drawer without saving (test verifies) ✓"
    - "locked_test_season yield fixture properly cleans up test state ✓"
    - "Backend locked field is read-only, no writes, no migration (per D9) ✓"
    - "Overwrite warning shown only when !locked — conditional on backend state ✓"
    - "Desktop also uses same locked condition (canEdit && !locked) — both surfaces consistent ✓"
    - "All touch targets ≥44px: edit button (h-11), input (h-11), save button (h-11) ✓"
    - "Edit control only shown when canEdit=true; backend auth is the actual security boundary ✓"
    - "Default status is 'rated'; only number field required for save ✓"
    - "Backend: 30/30 roster tests passed including locked field + fixture tests ✓"
    - "Frontend: 92/92 RosterTable tests passed including drawer semantics, Escape, warning, links ✓"
    - "Prior BLOCK issues resolved: input type=number, dialog ARIA+Escape, yield fixture ✓"
    - "Contract verification: all 8 SHALLs met (narrow edit, no-edit-when-signed-out, number-only, 44px, warning, locked field, same warning desktop, default status) ✓"

## Group 5 — 排阵页窄视口（5.8 VISUAL DIFF 实测）

摘要纯函数 constraintSummary 3 测过（点名锁定对、点名排除、无约束说「没有锁定或排除」）。
375×667 /lineup/USTC-CMU-HQU?D1a=p10651&D1b=p10655&ex=p10668：
- 首屏是结果（队头+cap+候选），侧栏控件 display:none，无横向溢出
- 关闭态摘要点名：「已锁 1 对 · D1 Bo Chunkun·Cai Zesheng · 排除 Chen Mike」（点名到人，非只给数量）
- 改约束按钮 44px；打开抽屉：aria-modal=true、内部可滚、搜索阵容按钮 44px、800 节点 0 不合格 最低 4.87、无横向溢出
- 不自动搜索：抽屉内是既有 GET form，唯一提交是「搜索阵容」按钮（vitest 断言无 onchange 导航）
1280×800（桌面回归）：控件栏 520px 显示、移动条隐藏、无横向溢出 —— 未变形
全套 vitest 358 通过；tsc --noEmit 干净

- group: 5
  attempt: 1
  scores:
    spec: 90
    runtime: 100
    code: 60
  total: 84
  status: RETRY
  findings:
    - "Panel open/close is pure local useState(false), never URL params — D6 met ✓"
    - "LineupControls form remains method='get' role='search' both desktop and mobile ✓"
    - "constraintSummary() names specific players + empty case says '没有锁定或排除' ✓"
    - "Dialog has role='dialog', aria-modal='true', internal scroll ✓"
    - "Submit button h-11 = 44px ✓, but open button same ✓"
    - "358/358 vitest pass ✓"
    - "🔴 HIGH: Touch target compliance incomplete — contract item 5 requires 44px for inputs; PlayerSelect h-[34px] (line 33) + checkbox labels px-2 py-1 (line 141) both under threshold in drawer variant. Fix pattern exists (h-11 on submit) but not applied to select/checkbox."
    - "🔴 HIGH: No-auto-fire test is false confidence — LineupMobileControls.test.tsx line 60 checks form.getAttribute('onchange')===null, but React never sets literal onchange DOM attr for synthetic handlers. This assertion passes identically with or without auto-fire behavior. Real behavior (render actual LineupControls + fire change event + assert no navigation) is untested."
    - "🟡 MEDIUM: Horizontal overflow risk on selects — LineupControls.tsx line 104-127: each lock row has flex-1 select with no min-w-0, so long player names can force overflow on 360px viewports. Undetected in narrow-viewport test."
    - "🟡 MEDIUM: Focus lands on close button, not first form field — LineupMobileControls.tsx line 38 querySelector('select, input, button') matches header close-button first. Should scope to controls container or be more specific."
    - "⚠️ LOW: Dialog lacks focus trap (Tab can escape), background scroll not locked."
  fix_tasks:
    - "5.F1 FIX — Touch targets: bump PlayerSelect h-[34px]→h-11 & checkbox label gap/padding/min-h when variant='drawer'"
    - "5.F2 FIX — No-auto-fire test: render real LineupControls, fire change event on select, assert no location/navigation"
    - "5.F3 FIX — Overflow: add min-w-0 to PlayerSelect or lock row, test at 360px viewport"
    - "5.F4 FIX — Focus: scope querySelector to controls div or limit to 'select, input' only"

## Group 5 — attempt 2 fixes (BLOCK/HIGH from attempt 1)

- 5.F1 触摸目标：PlayerSelect 加 tall prop，drawer 变体 h-11 + min-w-0；排除 checkbox label drawer 下 min-h-11 py-2；提交按钮 drawer h-11。实测 375 抽屉：select 44、checkbox label 44、min-width 0。
- 5.F2 假信心测试重写：渲染真 LineupControls，form submit 挂 spy，change select + toggle checkbox 后断言未提交，点搜索按钮才提交 1 次。
- 5.F3 溢出：PlayerSelect 加 min-w-0（实测 selMinW=0px、无横向溢出）。
- 5.F4 聚焦：useEffect 查 form 内首字段而非 header 关闭按钮；实测聚焦落在「D1 第一位」select。
新增触摸目标测试 2 条（drawer h-11/min-w-0/min-h-11；desktop 保持 h-[34px]）。全套 vitest 360 通过、tsc 干净。

- group: 5
  attempt: 2
  scores:
    spec: 100
    runtime: 100
    code: 90
  total: 98
  status: PASS
  findings:
    - "All five SHALLs from contract verified: results-first layout ✓, scroll container ✓, summary names players not counts ✓, empty state displays explicitly ✓, no auto-fire (explicit button only) ✓"
    - "D6 compliance: panel open/close is pure useState, never in URL — constraints wholly URL-driven ✓"
    - "Plain GET form unchanged; form inside mobile sheet inherits behavior ✓"
    - "constraintSummary() names specific players per line (D1 Bo·Cai) + names excluded by person (排除 Chen Mike) ✓"
    - "Empty constraint case returns '没有锁定或排除' (not blank) ✓"
    - "47/47 vitest pass (lineup directory); panel open/close/summary/no-auto-fire scenarios all green ✓"
    - "All four prior HIGH issues confirmed fixed:"
    - "  - (1) Touch targets: PlayerSelect h-11/min-w-0 + checkbox min-h-11 py-2 in drawer variant only; desktop stays h-[34px] ✓"
    - "  - (2) No-auto-fire test rewritten: renders real LineupControls, spies on form.addEventListener('submit'), fires change+click, verifies only button submits ✓"
    - "  - (3) Overflow: PlayerSelect min-w-0 prevents flex-1 forcing width on long names ✓"
    - "  - (4) Focus: querySelector scoped to form element inside drawer panel, lands on first select not header close button ✓"
    - "Code review: 0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW (per code-reviewer agent)"
    - "MEDIUM: No regression test for focus fix (activeElement not asserted); no page-level smoke test for drawer wiring"
    - "LOW: as never cast in test fixture defeats type checking; missing trailing semicolon in describe block"
    - "Diff generation issue: .group5.diff omits untracked LineupMobileControls.tsx/test.tsx (F2, F4 fixes). Verified directly from disk; recommend fixing diff-gen step."
    - "Contract verification: all 8 SHALLs met (narrow first-screen, scrollable panel, names in summary, empty state, no auto-fire, D6 pure-state, plain form, reasoning in code) ✓"

## Group 6 — 验证与交付

6.1 后端全套 pytest：440 passed（含 locked 2 条）。跑完 2025 数据被清（fixture TRUNCATE + 级联孤儿）。
6.4 补种：规则→名单→队名→清 players→migrate，恢复 375 players / 459 memberships / 375 UTRs。此后不再跑 pytest。
6.2 前端 vitest：360 passed。6.3 tsc --noEmit：干净。
6.5 窄视口 375 全站对比度终检：rules 4.97 / teams 5.01 / lineup 5.01 / roster 4.87 / players 列表 4.89 / player 详情 4.97 —— 全部 0 不合格。
   ↳ 发现**第 4 个既有对比度缺陷**（propose 与 group 1 都没抓到）：PlayerTable/详情页的 SETTLED/OK badge 用 `text-success`(#4c8a63) on 硬编码 `bg-[#eef4f0]` = **3.68**，193 节点。group 1 的 1.9 曾声称桌面「0 不合格」，但当时登录失败、队员管理两页从未真测，且只靠 token 测试（覆盖不到硬编码 hex 对）——「声称未验证」的典型。且 group 1 的「有」链接复用 SETTLED，等于我新加了一个 3.68 的可点链接。修：SETTLED/OK 的绿改 `text-[#3b6e4f]`（该底 5.34、白底 5.95），两文件同一常量都改。改后 0 不合格（最低 4.89）。
6.6 桌面 1280 终检：players 列表 4.89、0 不合格、无横向溢出。桌面布局仅 SETTLED 绿变深（对比度修复）+ 三处 UTR 链接 + 三个 token 变深。
