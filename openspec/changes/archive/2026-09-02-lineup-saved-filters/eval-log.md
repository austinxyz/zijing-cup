# Eval Log — lineup-saved-filters

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## group-1 / attempt-1

```yaml
group: 1
attempt: 1
scores:
  spec: 100
  runtime: 100
  code: 95
total: 99
status: PASS
findings: []
fix_tasks: []
```

**Summary:**
- Spec: All 9 SHALL requirements met (per-team storage, name+constraints-only, unique name, overwrite, empty rejection, admin-gated writes, open reads, HTTP-method auth, parameterized name).
- Runtime: 23/23 tests pass (save, retrieve, delete, overwrite, empty-name, unauthenticated-write rejection).
- Code: D1 schema correct (zijing_cup, FK cascade, JSONB, unique constraint, server defaults); D5 auto-protected POST/DELETE; D4 limits enforced; team scoping prevents cross-team access; no SQL injection (parameterized). Minor: upsert via conditional UPDATE instead of ON CONFLICT (viable, fully tested).

## group-2 / attempt-1

```yaml
group: 2
attempt: 1
scores:
  spec: 98
  runtime: 100
  code: 92
total: 98
status: PASS
findings: []
fix_tasks: []
```

**Summary:**
- Spec: All 11 SHALL + MAY requirements met (list+size, load→URL, no login, admin-only save/delete, empty-constraint disabled, non-admin read-only, lock-stale refuse with explicit player+line+rebuild+delete, no silent partial apply, no candidate on stale, no substitute guess, exclude-stale load normally, design tokens not hex). Contrast ≥4.5 and no-overflow verified live in session.
- Runtime: 26/26 tests pass (6 new Presets unit tests + 20 existing page tests, zero regression). Stale lock correctly refused; exclude-stale correctly navigates; admin gating works.
- Code: Clean implementation with proper TypeScript typing, pure helper functions (staleLockRefs, buildLoadHref, presetSize), server-action gating via adminWrite, design-token usage throughout. Minor: roster key set created twice in presetLoad (staleLockRefs + buildLoadHref) — could extract, but not a defect.
