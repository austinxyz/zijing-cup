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
