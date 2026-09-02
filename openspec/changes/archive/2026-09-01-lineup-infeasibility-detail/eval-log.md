# Eval Log — lineup-infeasibility-detail

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1, Attempt 1

```yaml
group: 1
attempt: 1
scores:
  spec: 100
  runtime: 100
  code: 98
total: 100
status: PASS
findings: |
  All specifications met. Four infeasibility reasons (gender_shortage, over_cap,
  over_gap, eligibility) diagnosed correctly from read-only pool analysis. Attribution
  only for user actions (excludes/locks) on gender_shortage; cap/gap/eligibility
  have empty attributed. Messages use facts, not blame. All 61 tests pass (new
  infeasibility tests + existing regression suite). Code is clean with proper
  dataclass structures and correct algorithm (one pass, same pool as legal_pairs).
fix_tasks: []
```

## Group 2, Attempt 1

```yaml
group: 2
attempt: 1
scores:
  spec: 95
  runtime: 100
  code: 95
total: 97
status: PASS
findings: |
  Spec: All D4 requirements met. Frontend correctly renders infeasibility reasons
  with proper tier styling (warning-surface for gender_shortage/cap/gap;
  surface-muted for eligibility). Attribution chips only on gender_shortage with
  user-action attribution (excluded/locked). Disclaimer preserved. All design
  tokens used (no hardcoded hex). Fixed render order (gender→cap→gap→eligibility)
  via REASON_ORDER sort. No numeric comparisons in frontend. Contrast verified live.
  
  Runtime: Both test files passed. 23 tests all green (2 scenarios: gender_shortage
  with attribution + eligibility without). No regressions in LineupResults tests.
  
  Code: Backend _attribution correctly transforms tab-separated names to display
  format matching frontend playerName(). Type safety strong (interfaces added).
  Component structure clean (ReasonTile extracted). Fallback path (placements)
  properly gated. Immutability maintained (array spread before sort). Tests are
  comprehensive for D4 scope.
fix_tasks: []
```
