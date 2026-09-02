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
