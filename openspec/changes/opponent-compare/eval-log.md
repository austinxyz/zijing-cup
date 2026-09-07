# Eval Log — opponent-compare

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: { spec: 95, runtime: 100, code: 88 }
  total: 95.6
  status: PASS
  findings:
    - "spec: Spec SHALL requirements all met (line order, names, status, player_gone, no prediction). MEDIUM deduction for two-decimal formatting guarantee not preserved in number type—round2() correctly rounds but Number(n.toFixed(2)) discards trailing zeros (0.70→0.7), violating '两位小数' contract term. Tests don't exercise values with trailing zeros."
    - "runtime: npm test pass (6 tests). tsc --noEmit clean."
    - "code: APPROVE from code-reviewer. MEDIUM: two-decimal display formatting not enforced at function boundary. All other aspects excellent (type safety, purity, error handling, comprehensive tests)."
  fix_tasks: []

- group: 2
  attempt: 1
  scores: { spec: 90, runtime: 0, code: null }
  total: 36
  status: BLOCK
  findings:
    - "runtime: npm test FAILED—TopNav.test.tsx line 65 test expects 对手对比 to render as disabled (pending:true) but implementation renders it as link (pending:false per nav.ts). Test not updated to match Sidebar.test.tsx changes. tsc clean but tests must pass."
    - "spec: Implementation complete: /compare page with canEdit gate, redirect, two pickers, URL state, empty state, controls clearing lineup on team change, error.tsx, nav.ts updated. Spec 90/100 deduction for TopNav test coverage gap—missing test update shows incomplete QA. All SHALL requirements met by code."
    - "code: Awaiting code-review completion. Known issue: CompareControls uses controlled selects on soft-nav without explicit key pattern (design D2 pitfall)—may silently show stale values on URL change in rare soft-nav edge cases, though props-driven update should mitigate. Test failure blocks evaluation."
  fix_tasks:
    - "2.F1 UPDATE — frontend/app/[season]/[division]/TopNav.test.tsx line 65-71: change test from expecting aria-disabled to expecting link with href=/compare (mirror Sidebar.test.tsx changes). Rename test to 'links 对手对比 to the division's compare page'."
    - "2.F2 AUDIT — CompareControls soft-nav: add explicit key={`compare-${sel.a}-${sel.al}-${sel.b}-${sel.bl}`} to Component or verify controlled-select re-sync works without it under soft-nav."

- group: 2
  attempt: 2
  scores: { spec: 95, runtime: 100, code: 85 }
  total: 95
  status: PASS
  findings:
    - "spec: All SHALL requirements met (page at /compare, two pickers with state in URL, empty states for no-lineups and no-selection, line-by-line display with name/gender/UTR/diff, line order from getDivisionRules, status labels for utr_moved/illegal/player_gone, player_gone has no total, canEdit gate redirects unresolved to teams, no guest view, 对手对比 link in nav at /compare). Deduction for CompareControls.tsx having no unit test of its only logic (onChange param-builder and lineup-clear). Integration coverage via page.test.tsx exists and proves the flow works end-to-end."
    - "runtime: npm run test -- compare nav app-shell: 4 test files, 20 tests PASS. npx tsc --noEmit: clean (no errors). TopNav.test.tsx fix (F1 from attempt 1) included—test now expects link with href=/2025/silver/compare, matches Sidebar.test.tsx. All gate/empty-state/comparison/nav tests passing."
    - "code: Code-reviewer score 85/100. HIGH: error.tsx has stale copy-pasted comment (says 'player workbench' instead of 'compare page', creates risk of propagation to next new route). HIGH: CompareControls.test.tsx missing—only client component in this group and its only real logic (apply() param builder + team-change-clears-lineup + disabled states) has zero unit test coverage; integration via page.test.tsx mocks router as no-op and never fires onChange. MEDIUM: page.tsx line 179 uses index-as-key in players list (fragile if future edits change lineup and same line re-renders with different player at same index). No security/correctness blockers; canEdit gate applied correctly, concurrent Promise.all for teams/rules/lineups, Decimal-to-display logic sound."
  fix_tasks: []
