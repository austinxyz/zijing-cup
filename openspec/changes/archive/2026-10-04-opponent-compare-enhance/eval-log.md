# Eval Log — opponent-compare-enhance

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 85}
  total: 97
  status: PASS
  findings:
    - "Spec: All contract requirements satisfied (table schema, uniqueness, validation, preservation, auth)"
    - "Runtime: 13/13 tests pass (save, list, overwrite, validation, limit, line-notes, delete, auth)"
    - "Code: MEDIUM issue — missing FK from division_code to divisions table (consistency, not functional)"
  fix_tasks:
    - "1.F1 FIX — Add foreign key (season_year, division_code) references divisions (season_year, code) to migration for data integrity consistency"

- group: 2
  attempt: 1
  scores: {}
  total: 0
  status: BLOCK
  findings:
    - "Code: HIGH — saveComparison missing input validation. Backend expects name trimmed, non-empty, ≤60 chars. Currently sends raw input. Violates codebase pattern (see savePlayerFields which trims). Fix: validate and trim name before adminWrite."
    - "Code: HIGH — setLineNote missing input validation. Backend expects text trimmed and ≤500 chars per MAX_NOTE_LENGTH. Currently sends unvalidated text. Violates codebase pattern. Fix: validate, trim, and check length limit before adminWrite."
  fix_tasks:
    - "2.F1 FIX — saveComparison: Trim name and validate (non-empty after trim, ≤60 chars) before calling adminWrite"
    - "2.F2 FIX — setLineNote: Trim text and validate (≤500 chars per MAX_NOTE_LENGTH) before calling adminWrite"

- group: 2
  attempt: 2
  scores: {spec: 95, runtime: 100, code: 99}
  total: 98
  status: PASS
  findings:
    - "Spec: All contract SHALL met — references (not snapshots), real-time recalc on expand, protected write routes with scope, graceful degradation to [], entry-point trimming, revalidate with layout scope, line_notes map"
    - "Runtime: 2 test files, 35 tests all passed; tsc exit 0"
    - "Code: Code-reviewer found 0 issues (CRITICAL/HIGH/MEDIUM/LOW all 0). Fixes from attempt 1 verified: saveComparison trims name (per codebase pattern); setLineNote trims text and preserves empty (design decision per comment). All server actions use correct adminWrite scope and revalidatePath."

- group: 3
  attempt: 1
  scores: {spec: 50, runtime: 100, code: 60}
  total: 72
  status: BLOCK
  findings:
    - "CRITICAL: No save comparison UI — entire save workflow unreachable. No 'Save' button/form anywhere on page; saveComparison() defined and tested but never called from UI. Core feature non-functional end-to-end despite backend + plumbing complete."
    - "IMPORTANT: Design deviation — D7 specifies POST(create) + PATCH(rename/notes). Implementation uses POST for both create and notes. No true rename operation; upsert-by-name instead."
    - "IMPORTANT: canEdit passed as hardcoded literal to CompareSavedCards instead of actual auth state (safe due to page gate, but poor practice for defense-in-depth)."
    - "Strengths: Backend solid with proper schema (search_path, no cascade on lineup FK). Edge cases handled (deleted lineups, graceful degrade on read error). Tests thorough for backend endpoints (validation, 50-limit, auth). Frontend runtime tests 100% pass (31/31), tsc clean."

- group: 3
  attempt: 2
  scores: {spec: 85, runtime: 95, code: 75}
  total: 87
  status: RETRY
  findings:
    - "Spec (85): All requirements present and routable end-to-end — CompareSaveBar save entry-point wired, CompareSavedCards cards expand in-place, SideLineupPreview previews rendered per side, sidePreview/comparisonView helpers resolve assignment to seats. Signatures shown in dropdowns. Deleted lineup marked '阵容已删' without crash. Page gated with canEditCompetition. Error handling gaps (note-save/delete silent failures) reduce score."
    - "Runtime (95): 34 tests pass (8 files), tsc exit 0. All new components tested; happy paths fully covered. Error-path branches (note-save/delete failures) not exercised — silent failures wouldn't surface in tests."
    - "Code (75): Architecture sound — expand state local per card (doesn't touch URL/picker), tenant scoping correct (season+division on reads/writes), semantic HTML/accessibility present (aria-expanded, aria-label, role=alert). Gaps: HIGH — CompareSavedCards NoteCell/delete missing try/catch (error becomes unhandled promise rejection, note looks saved when it failed); MEDIUM — updated_at never set on update; LOW — per-line sum not shown in saved cards (UI inconsistency), SaveInput/ComparisonInput duplicated types."
    - "Code reviewer: Status WARN (not BLOCK) — the original BLOCK reason is fixed. HIGH issue is mechanical (mirror CompareSaveBar's existing error pattern) and localized."
  fix_tasks:
    - "3.F1 FIX HIGH — CompareSavedCards NoteCell + deleteButton: Wrap onSetNote/onDelete calls in try/catch, track error state per-row, render error alert (mirror CompareSaveBar pattern). Update tests to cover failure paths."
    - "3.F2 FIX MEDIUM — backend setLineNote/save_comparison: Set updated_at = func.now() on update paths for accurate tracking."
    - "3.F3 FIX LOW — Export SaveInput from actions.ts, reuse in CompareSaveBar instead of local duplicate."
    - "3.F4 OPTIONAL — CompareSavedCards: Show per-line aSum/bSum in expanded table for consistency with live compare table."

- group: 3
  attempt: 3
  scores: {spec: 98, runtime: 100, code: 96}
  total: 98.4
  status: PASS
  findings:
    - "Spec (98): All contract SHALLs fully met. Preview renders on one-side select (no wait). Signatures computed from D1. Saved comparisons as collapsible cards in-place (local state, no URL). Per-line notes edit/clear on-demand with error handling + rollback. Deleted lineup marked '阵容已删', comparison preserved. Auth gate upheld (page-level canEdit check). All scenarios covered. Score: 98 (deduct 2 for optional per-line sum not displayed)."
    - "Runtime (100): vitest 8 files × 36 tests all pass. tsc --noEmit exit 0. All new files verified: migration, models, routers, API functions, components, action handlers. getSavedComparisons degrades to [] on error (handles un-migrated remote DB). No type/build issues."
    - "Code (96): Architecture: references (not snapshots), real-time expand, local expand state (no URL pollution), proper DB scoping by (season, division). Error handling: try/catch + role='alert' + rollback in NoteCell + delete button. DB integrity: JSONB immutability (new dict), updated_at bumped on all writes, no cascade FK on lineup refs (intentional design D2). Type safety: all interfaces defined, SavedComparison exported, no any. Routes: proper status codes (422/409/404), response models, method-keyed auth (no additional checks needed). Test coverage: happy + error paths for save/note/delete. Deduction: 4 points for minor items (SaveInput duplication intentional/acceptable, per-line sum optional, NoteCell sync edge case documented)."
    - "Code-reviewer independent verification: Confirmed both HIGH items from attempt 2 are now resolved (error handling + updated_at). Found no CRITICAL/HIGH/MEDIUM issues. Flagged only MEDIUM (TOCTOU race on 50-limit, acceptable for single-admin tool) and LOW/optional items (already tracked or deferred by spec). Verdict: PASS."
  verdict: "All contract SHALL requirements satisfied. Real-time saved-comparison workflow end-to-end functional. Error resilience verified (both sides: user-facing + read degradation). Auth/tenancy scoping correct. Build + tests clean. Ready to merge."
