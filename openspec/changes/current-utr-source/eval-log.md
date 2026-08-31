# Eval Log — current-utr-source

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All nine SHALL statements implemented correctly"
    - "spec: All four previous attempt blockers resolved (numeric comparison, pairing validation, duplicate detection, CSV comma handling)"
    - "spec: Design requirements D2, D3, D6 fully met"
    - "runtime: 26/26 tests pass; test coverage includes all contract scenarios"
    - "code: Pure functions with no side effects; frozen dataclasses enforce immutability"
    - "code: Comprehensive error messages; regex anchored correctly; edge cases handled (NaN/Infinity)"
    - "code: No CRITICAL or HIGH severity issues found"

- group: 2
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 95}
  total: 97
  status: PASS
  findings:
    - "spec: All 9 SHALL statements implemented (read endpoint with 8 fields, write endpoint with transactional behavior, field-level access control, season lock does not block, player_id exposed)"
    - "spec: Read endpoint returns correct URL pattern, field order matches roster page, 404 for unknown team"
    - "spec: Write endpoint accepts only 5 fields via model-level definition + Pydantic extra='ignore'; field smuggling test passes"
    - "spec: Batch rollback on error verified (one bad id causes entire batch rejection)"
    - "spec: Season lock does not block current UTR writes (tested with SeasonLock present)"
    - "runtime: test_utr_api.py 8/8 passed; test_roster_api.py 28/28 passed"
    - "runtime: Coverage includes read/write paths, 404 handling, auth denial (403), locked season, batch atomicity, field filtering"
    - "code: No CRITICAL or HIGH severity issues (code-reviewer: APPROVE)"
    - "code: Field protection via CurrentUtrUpdate model + exclude_unset semantics is sound"
    - "code: Transaction atomicity ensured by Session commit after all mutations; validation before mutations"
    - "code: Admin-gated write auth correct (PUT in WRITE_METHODS); read auth only requires shared secret"
    - "code: 3 LOW-level notes: duplicate player_id in batch (last-write-wins, not tested), no status enum validation (consistent with Player model), order test compares names not ids (but implementation reuses exact list, so immaterial)"

- group: 3
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 85}
  total: 95
  status: PASS
  findings:
    - "spec: All SHALL statements satisfied — elsewhere endpoint returns cross-division memberships; applicable property implements all-or-nothing rejection; coverage/uncovered counts pre-existing"
    - "spec: Elsewhere endpoint uses single .in_() query per spec requirement D2 (not per-player iterations)"
    - "spec: Cross-division visibility verified (test_a_change_shows_up_on_the_other_divisions_team_too confirms value consistency across divisions)"
    - "spec: Applicable property correctly checks 'not self.errors' and test_a_sheet_with_any_error_produces_no_changes_at_all verifies False on any error"
    - "runtime: 37/37 tests pass; both test_utr_api.py and test_utr_sheet.py fully green"
    - "runtime: New tests cover elsewhere endpoint, applicable property, and cross-division value consistency"
    - "code: No CRITICAL or HIGH severity issues (code-reviewer: APPROVE)"
    - "code: MEDIUM (non-blocking): applicable property not yet wired into write endpoint; groups 4/5 will add the diff/confirm endpoint that checks this"
    - "code: LOW: test_a_sheet_with_any_error_produces_no_changes_at_all overstates coverage (asserts errors/applicable but not changes == [])"
    - "code: LOW: No test for empty-roster case; read_other_memberships early-return at line 71-72 is untested"
    - "code: Query efficiency confirmed; filtering correct (excludes current team with division_code == code and other_code == team_code)"

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 60}
  total: 92
  status: PASS
  findings:
    - "spec: All eight SHALL statements fully satisfied (two-tab route with export/import, first 3 cols marked, two entry points single parser, button text correct, login gate, error.tsx)"
    - "spec: Export renders 8-column table with 'id/姓/名/single/single-status/double/double-status/link' column order exactly matching spec"
    - "spec: Export marks first 3 columns read-only with bg-surface-muted visual indicator"
    - "spec: Export offers 复制整张表 (copy to clipboard as TSV) and 下载 CSV (download as CSV file)"
    - "spec: Import provides both textarea (paste from Sheets) and file input (upload CSV); both call identical onSubmit(text) → previewSheet handler"
    - "spec: Button says 看差异 with note 不会直接写库 (clearly indicates diff, not write)"
    - "spec: Route has own layout.tsx login gate (isSignedIn check + redirect to /login) since this sits under teams/ not players/"
    - "spec: Route has error.tsx error boundary; test confirms 签出访客被挡在门外"
    - "spec: Backend preview endpoint returns complete DiffResult (changes, errors, counts, covered, not_covered, applicable, elsewhere) without writing"
    - "spec: Backend apply endpoint re-derives diff from raw text (not trusting client diff); raises 422 and writes nothing if applicable=false (all-or-nothing)"
    - "spec: UtrDiff.tsx (pre-existing, not in diff slice) fully renders diff screen with: per-field change counts, unchanged-fields 不变 placeholders, cross-division 也在 markers, error list, covered/not_covered counts, disabled apply button when errors exist"
    - "runtime: 22/22 vitest tests pass (UtrExport×2, UtrImport×2, layout×2, UtrDiff×16); vitest run utr output shows 4 test files"
    - "runtime: npx tsc --noEmit exit code 0; no type errors"
    - "code: HIGH (should fix before merge): Backend preview_sheet and apply_sheet return untyped dict; no response_model, FastAPI/OpenAPI cannot validate shape; use Pydantic models mirroring SheetDiff/UpdateResult"
    - "code: HIGH (should fix before merge): UtrPanel.tsx (the orchestration component wiring tabs/preview/diff/apply state machine) has zero test coverage; UtrExport/UtrImport/UtrDiff/layout tested individually but not the integration"
    - "code: HIGH (should fix before merge): UtrExport.copyAll() has no error handling for clipboard.writeText rejection; unhandled promise rejection when clipboard permission denied or document unfocused"
    - "code: MEDIUM: getUtrElsewhere in lib/api.ts defined but never called; elsewhere data returned inline from previewSheet instead; remove or document intent for future"
    - "code: MEDIUM: CSV export joins raw cells with no quoting; parse_sheet properly handles CSV via csv.reader; round-trip silent column misalignment if cell contains comma (low probability given id/CN name/enum/digit content but asymmetric)"
    - "code: MEDIUM: _typed() missing return type annotation (should be Optional[Decimal | str] or similar); violates project convention"
    - "code: LOW: No optimistic-concurrency guard between preview and apply (acceptable for single-admin shared-secret tool but worth documenting)"
    - "code: LOW: actions.ts has no dedicated test; thin pass-through to adminWrite but URL construction/encodeURIComponent only exercised indirectly via UtrPanel"
  fix_tasks:
    - "4.F1 FIX — Add Pydantic response models for preview_sheet and apply_sheet (mirror SheetDiff and {updated: int}); add response_model to @router.post decorators"
    - "4.F2 FIX — Add UtrPanel.test.tsx testing tab switching, preview→diff→apply state machine, failure messages (读不到差异 / 写入没有成功), and cleared state after apply"
    - "4.F3 FIX — Wrap UtrExport.copyAll() in try/catch; show user feedback (toast or inline message) if clipboard.writeText rejects"
    - "4.F4 CLEANUP — Remove unused getUtrElsewhere from lib/api.ts or add comment explaining deferred use case"
    - "4.F5 CLEANUP — Fix CSV export to properly quote cells (csv.DictWriter or custom quoting) to match parse_sheet expectations"
    - "4.F6 CLEANUP — Add return type annotation to _typed() function in utr.py"

- group: 5
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All 7 SHALL requirements fully implemented and verified"
    - "spec: Per-field tally shows change counts (UtrDiff.tsx:52-79); flags suspicious high counts with warning styling"
    - "spec: Player rows display old/new values with 「不変」 placeholders for unchanged fields (line 134)"
    - "spec: All errors shown with line numbers and messages (lines 155-162)"
    - "spec: Coverage and uncovered counts displayed; cross-division members named (lines 88-99, 111-116)"
    - "spec: Confirm button disabled on errors; shows error count (lines 178, 184-187)"
    - "spec: Color scheme correct — warning for high counts/cross-group, neutral for uncovered, danger for error line numbers"
    - "runtime: npm run test -- UtrDiff: 10/10 tests pass (covers old/new display, unchanged-field placeholder, tally, button state, error display, coverage, cross-group)"
    - "runtime: npx tsc --noEmit: 0 type errors"
    - "runtime: pytest tests/test_utr_api.py::TestPreviewAndApply: 4/4 tests pass (preview doesn't write, errors prevent application, apply writes data, all-or-nothing semantics)"
    - "code: No CRITICAL or HIGH severity issues (code-reviewer: APPROVE)"
    - "code: MEDIUM (non-blocking): response typing should use Pydantic model instead of bare dict for OpenAPI schema; implicit trust in change.player_id matching between router and utr_sheet.py; two overlapping write endpoints (PUT /players/current-utr and POST /utr-sheet/apply)"
    - "code: LOW: SheetDiff.counts type is Record<string, number> instead of the 5 known fields; admin credential needed for preview endpoint (read-only but stateful so requires auth); suspicious-count highlighting (>= 5 && highest) lacks direct test"
    - "code: Frontend/backend contract consistent; field names and elsewhere structure match exactly"
    - "code: All tests properly isolated; no .only/.skip; no shared mutable state"

- group: 6
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 92}
  total: 98
  status: PASS
  findings:
    - "spec: All 8 SHALL statements implemented — edit entry on each row when logged in (RosterTable.tsx:152-161); entire row transforms to inputs (EditableCells:180-235); saves revert row to read-only with new values"
    - "spec: One-player-at-a-time enforced via state = number | null; no multi-row editing possible"
    - "spec: Batch import link rendered (page.tsx:55-62); both link and edit buttons hidden when canEdit=false"
    - "spec: Two-layer protection confirmed — UI hides controls AND backend requireAdmin() gate verifies admin credential"
    - "runtime: npm run test -- RosterTable: 29 tests pass (includes edit entry, one-row editing, save behavior, auth hiding)"
    - "runtime: npx tsc --noEmit: 0 type errors"
    - "code: No CRITICAL or HIGH severity issues (code-reviewer: APPROVE)"
    - "code: LOW (non-blocking): React key uses player names (collision risk if duplicate names); use player_id for stable keying"
    - "code: LOW (UX enhancement): useTransition() called but isPending not captured; no visual feedback during save on Render free tier (slow cold starts)"
    - "code: Architecture sound — RosterEditor wraps table with save callback; editing state properly scoped"
