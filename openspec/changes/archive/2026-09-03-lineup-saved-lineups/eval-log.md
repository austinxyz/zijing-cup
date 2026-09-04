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

---

## Group 3 / Attempt 1

**Evaluation Date:** 2026-09-03

### Scores

```yaml
spec: 100
runtime: 100
code: 95
total: 99
threshold: 70
status: PASS
```

### Findings

**Spec Compliance:**
- All contract SHALLs met: candidate row shows "保存此阵容" only to admins, requires name, team-unique, same-name overwrites.
- Saved lineup page lists all four states (valid/utr_moved/illegal/player_gone) with correct badges.
- UTR diffs point-name movers (X→Y), violations list rules that break, player_gone names departed seats.
- Legality source verified: SavedLineups.tsx branches on `item.status` (backend field), never re-derives from snapshot. Test (line 414) explicitly asserts status comes from backend, not snapshot comparison.
- Load encodes assignment to five-line lock= URL (D1a, D1b, etc); stale-ref check prevents bad-key search.
- Design tokens used throughout: success/danger/warning/muted colors from globals.css, no hardcoded hex in components.
- Contrast ≥4.5:1: success color darkened from #4c8a63 to #3a6b4d (5.64:1 on white, 4.94:1 on success-surface); globals.contrast.test.ts verifies all badge pairs.
- Responsive layout: grid-cols-2 sm:grid-cols-5 for lines, gap-2 etc, tested at desktop and expected <768 breakpoints.

**Runtime:**
- 51 test files, 408 tests pass (npm run test).
- Covers all required scenarios: SaveLineupButton.test.tsx (admin sees entry, non-admin doesn't, calls action with name+assignment), SavedLineups.test.tsx (four states render, load button encodes correctly, stale refs block load, delete gated to admin), savedLoad.test.ts (candidateAssignment extraction, savedStaleRefs detection, href building).
- No regressions in existing lineup tests.

**Code Quality:**
- lib/api.ts: SavedLineup interface with clear comments ("status is the backend's verdict — the front end never re-derives legality from the snapshot"). getSavedLineups() fails gracefully to empty list (table may not exist post-deploy before hand-run migration).
- SaveLineupButton.tsx: "use client" component, canEdit gate returns null early, calls saveAction with trimmed name and candidateAssignment result.
- SavedLineups.tsx: Maps BADGE[status] to render; status branching (line 553) is authoritative, utr_diff only for display. Stale check via savedStaleRefs prevents load if any key departed.
- saved/page.tsx: Server component, binds actions to (season,division,code), error boundary prevents cold-start timeout from blanking whole app.
- Design patterns: Token classes (text-success, bg-success-surface, border-success-border, etc) from globals.css; no literals. Actions properly marked POST/PUT/DELETE for method-keyed admin gate.
- Tests: Good coverage of gating (admin vs visitor), state transitions, load/delete flows; snapshot-vs-status legality test is explicit.
- Minor: error message in SaveLineupButton could be more specific (shows "保存失败" for all catch paths), but acceptable for UI dialog.

### No Blockers

---

## Group 4 / Attempt 1

**Evaluation Date:** 2026-09-03

### Scores

```yaml
spec: 100
runtime: 100
code: 95
total: 99
threshold: 70
status: PASS
```

### Findings

**Spec Compliance:**
- All contract SHALLs met: editor allows admin to swap two seats (cross-line or same-line) and replace a seat from the whole roster.
- Real-time validation: every edit triggers POST validate (debounced 300ms), shows "校验中" state, displays "实时：这套现在合法。可以存回。" or violations inline.
- Free editing with backend legality guard: no pre-blocking of duplicates/invalid states; violations surfaced by check_lineup only, never pre-filtered.
- Save-back: PUT overwrites assignment, backend re-snapshots from current roster, save-back button disabled until legal (disabled={!legal || saving}).
- Accessibility: all buttons use min-h-11 (44px touch targets), design tokens throughout (success-surface, danger-surface, warning-surface, muted-foreground, border, etc), responsive grid (grid-cols-2 sm:grid-cols-5), no hardcoded hex colors.
- Admin gate: validateAction and saveBackAction only passed when canEdit=true; both use adminWrite (POST/PUT method-keyed auth).

**Runtime:**
- 53 test files, 421 tests pass (npm run test).
- Comprehensive coverage: editor.test.ts (swap/replace change assignment correctly, debounce collapses rapid edits to single call, violations render when illegal, save-back enabled only when legal); LineupEditor.test.tsx (same operations via UI, immutability verification).
- No regressions; all existing lineup tests pass.

**Code Quality:**
- Editor helpers (swapSlots, replaceSlot, copy): pure functions properly avoiding mutation; test_do_not_mutate tests explicit.
- No console.log statements; no hardcoded colors (all design tokens); TypeScript strict (tsc --noEmit passes).
- Debounce implementation clean: skip on first run (no validation of unchanged initial state), cancelled flag prevents race conditions, cleanup cancels timer if assignment changes before timeout.
- Component structure: LineupEditor (editor UI + live verdict), SavedLineups (card list + editor mount point), saved/page.tsx (server component binding actions).
- Live verdict from backend only (violations come from validateAction response), never re-derived front-end.
- Admin gate properly enforced: actions only bound when canEdit=true; POST validate and PUT save-back auto-gated by adminWrite method check.

### No Blockers
