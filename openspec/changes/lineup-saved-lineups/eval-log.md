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

---

## Group 2 / Attempt 1

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
- All contract SHALLs met: accepts 5-line assignment, uses current UTRs via load_roster, calls check_lineup (no duplicate logic), returns Violation-shaped list with code/line/amount/message.
- Key validation via _reject_old_keys (unknown→422, old format→stale-link), follows URL manual-fill pattern exactly.
- Conflicts (duplicate placement, over-cap, gap, eligibility) delegated to check_lineup, not pre-blocked.
- POST method auto-admin-gated by middleware (no new auth logic needed).

**Runtime:**
- 14/14 tests pass (test_saved_lineups.py validate suite).
- Covers all required scenarios: legal assignment returns empty violations, various illegals (over_cap, gap, dupe, eligibility) return violations, unknown key 4xx, no credentials rejected.
- Seeded fixture creates realistic team with 10 players and legal baseline assignment.

**Code Quality:**
- assignment_violations(): Clean, reuses check_lineup cleanly, raises UnknownAssignmentKey for missing keys.
- validate_saved_assignment route: Correct order (load ruleset, load roster, validate keys, call assignment_violations). Error handling maps exceptions to right HTTP codes.
- ValidateAssignmentIn/Out models properly typed.
- No new legality code; all logic via check_lineup.
- Comments explain POST reasoning (admin decision).

### No Blockers
