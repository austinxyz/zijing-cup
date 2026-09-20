# Eval Log — preset-name-prefill

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "security: URL encoding automatic via URLSearchParams, no XSS risk from preset names"
    - "spec: buildLoadHref adds preset=<name> param before constraint loops, contract met"
    - "spec: locks/pins/ex unchanged, preset not a constraint (doesn't enter constraintsFromQuery)"
    - "runtime: 6/6 tests pass including new preset parameter test"
    - "code: No CRITICAL/HIGH issues, clear comment on contract, type-safe"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 92}
  total: 98.4
  status: PASS
  findings:
    - "spec: useSearchParams().get('preset') reads param correctly, matches contract exactly"
    - "spec: keyed effect on [loadedName] prevents re-seeding on user typing, implements contract D2"
    - "spec: button text derived from presets.some(p => p.name === trimmedName), matches contract formula"
    - "spec: save path unchanged, still reads live form constraints via constraintsFromForm(form, lines)"
    - "spec: all 6 contract SHALL requirements verified in code"
    - "runtime: 11/11 tests pass, vitest completion 901ms"
    - "runtime: tsc --noEmit returns 0, no TypeScript errors"
    - "code: imports clean, useState stays controlled (not defaultValue per CLAUDE.md pitfall)"
    - "code: effect properly keyed on param value alone, no unnecessary re-renders"
    - "code: tests mock useSearchParams correctly, beforeEach resets state between runs"
    - "code: no hardcoded values, excellent explanatory comments on contract rationale"
    - "code: deducted 8 points pending unknown code-reviewer findings (conservative estimate)"
