# Eval Log — lineup-saved-lineups

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 / Attempt 1

**Evaluation Date:** 2026-09-03

### Scores

```yaml
spec: 100
runtime: 100
code: 95
total: 99
threshold: 80
status: PASS
```

### Findings

**Spec Compliance:**
- All contract SHALLs met: per-team storage, snapshot immutability, same-name overwrite, auth pattern, four-state revalidation, player_gone rejection.
- `revalidate_saved` pure function correctly re-judges with current UTR via `check_lineup`.
- Snapshot never touches participation UTR or engine behavior.

**Runtime:**
- 24 tests pass (test_saved_lineups.py + test_admin_auth.py).
- Covers all required scenarios: save/list/delete, same-name overwrite, snapshot immutability, four-state revalidation, admin auth.

**Code Quality:**
- `revalidate_saved`: Clean, early-exit on player_gone, no side effects.
- `save_lineup`: Proper validation (name length, empty), upsert via update-if-exists pattern, per-team cap.
- Schema: Explicit server_default on NOT NULL timestamps avoids SQLModel NULL-send bug.
- Tests: Comprehensive; snapshot immutability test (test_saving_a_lineup_leaves_participation_utr_untouched) directly verifies UTR is not written back.
- Minor: cap check uses list() instead of COUNT query; acceptable for 50-item limit.

### No Blockers
