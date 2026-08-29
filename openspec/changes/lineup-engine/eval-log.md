# Eval Log — lineup-engine

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 98}
  total: 99.6
  status: PASS
  findings:
    - "spec: all 6 core constraints implemented and correct"
    - "spec: buffer correctly shared team budget, not per-line"
    - "spec: open lines (cap=None) skip checks, don't consume budget"
    - "spec: high-UTR limits check both count and restricted_to_lines"
    - "spec: women on men's lines judged by men's limits"
    - "spec: men's doubles order allows equals, only rejects inversions"
    - "spec: all violations actionable with line and amount"
    - "runtime: 29/29 tests pass in 0.05s"
    - "runtime: all 4 boundary types covered (buffer overbudget, equal mens, open line, eligibility line)"
    - "code: pure function, no database access"
    - "code: decimal throughout, no float leakage"
    - "code: frozen dataclasses, immutable"
    - "code: complete type annotations"
    - "code: comprehensive test coverage with edge cases"
