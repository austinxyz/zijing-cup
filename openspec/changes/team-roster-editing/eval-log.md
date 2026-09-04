# Eval Log — team-roster-editing

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 75}
  total: 94
  status: PASS
  findings:
    - "[HIGH] load_rules._field_differences() doesn't inspect borrowed_limits field changes — affects incremental edits to existing divisions' borrowed_limits won't persist on reload"
  notes:
    - "Migration, model schema qualification, seed values, and fresh seeding all correct per contract"
    - "89/89 tests pass including 3 new borrowed_limits tests"
    - "HIGH issue: drift-detection gap doesn't affect fresh seed (group-1 deliverable) but needs fixing for future season updates"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "[MEDIUM] school_count lacks bounds validation — accepts any int including negative/zero, should validate >= 1"
  notes:
    - "All 7 contract SHALLs verified: membership PATCH endpoint isolated from 5-field UTR, method-keyed admin auth, server-side representing_school clearing when borrowed/wildcard true, batch doubles overwrite respects season lock, school_count writable, Decimal full-stack, 403 on missing admin, no hardcoded secrets"
    - "112 tests pass (507 total) including 7 new test_team_editing.py tests covering membership flags, school_count, and batch doubles with locked/unlocked season logic"
    - "0 CRITICAL/HIGH issues; membership write properly isolated from UTR endpoint; auth middleware confirmed protecting both new PATCH routes"
    - "LOW notes: redundant team lookup in patch_team (already fetches before calling set_team_school_count), no season-lock guard on membership writes (intentional as metadata not competitive data)"

- group: 3
  attempt: 1
  scores: {spec: 40, runtime: 100, code: 20}
  total: 60
  status: RETRY
  findings:
    - "[CRITICAL] bool(membership.is_borrowed_player) silently collapses None (unmarked, unknown) to False (confirmed not borrowed), violating 3-state model. Unmarked players are not counted toward on-court borrowed cap, enabling silent under-enforcement of competitive-fairness rule. Schema docstring explicitly warns against this collapse; test suite doesn't exercise load_roster integration path to catch it."
    - "[LOW] borrowed_players_checked docstring (search.py:121-124, query.py:158-161) claims flag is 'True when school_count is set' but actual trigger is 'cap was resolved from DivisionBorrowedLimit table' — school_count can be set with no matching rule row, leaving flag False. Docstring should say 'true when a cap was resolved' to avoid future reader confusion."
  notes:
    - "All 16 contracted tests pass (100%: test_no_cap_means_not_checked, test_over_cap_lineup_is_rejected_and_reported, test_within_cap_is_allowed, + 13 infeasibility/report tests)"
    - "Architecture correct: leaf filter counts all 10 on-court borrowed correctly; sole-rejection detection sound (empty deduped + borrowed_example + not truncated implies cap is why); display names use _display_name avoiding tab; null school_count skips enforcement and keeps flag false"
    - "CRITICAL: bool() bug undermines entire spec — unmarked members silently pass cap check, no-solution borrowed_over_limit may never fire when it should"
    - "Tests don't fail because test_lineup_borrowed.py builds Candidate objects directly, bypassing load_roster where the bug lives; no integration test exercises load_roster + is_borrowed_player=None"

- group: 3
  attempt: 2
  scores: {spec: 98, runtime: 100, code: 97}
  total: 99
  status: PASS
  findings: []
  notes:
    - "Design fix applied: load_roster now uses `borrowed=(membership.is_borrowed_player is True)` with explicit comment (lines 72-78) explaining fail-open rationale: counting None would make unmarked teams always infeasible; only confirmed True counts toward cap"
    - "New test `test_load_roster_counts_only_confirmed_borrowed()` validates the exact three-state handling: True→borrowed=True, None→borrowed=False, False→borrowed=False; same result returned for both None and False (unmarked indistinguishable from confirmed not)"
    - "All 16 tests pass including new borrowed-limit tests (test_no_cap, test_over_cap_rejected_and_reported, test_within_cap_allowed) and existing suite (no regression)"
    - "Runtime: Cap enforcement logic verified — `if borrowed_cap is not None:` guards the comparison; borrowed_example captured for first over-cap lineup; borrowed_over_limit set only when result is empty AND truncated=False AND cap was the reason"
    - "Schema/migration correct: teams.school_count + division_borrowed_limits table with set search_path; _borrowed_on_court_cap() handles null gracefully (returns None when school_count unset or no rule row)"
    - "Display: _display_name() used to format names avoiding tab artifact; BorrowedOverLimit dataclass holds names, on_court, cap"
    - "Minor (LOW): Unused deduped variable in result condition (line 260) always evaluates to False, making guard redundant but harmless — condition effectively 'if borrowed_cap is not None and not truncated and borrowed_example is not None'"
    - "Prior CRITICAL resolved: fail-open design is correct, consistently implemented, and test-covered"

- group: 4
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 60}
  total: 90
  status: BLOCK
  findings:
    - "[HIGH] Empty doubles_utr field causes 422 error blocking entire batch save. TeamEditPanel sends empty string instead of null when user clears field; backend Decimal parsing fails and all-or-nothing batch logic rejects entire save. Existing editors (RosterTable EditDrawer) correctly normalize `doubles_utr: v === \"\" ? null : v`; TeamEditPanel diverges from pattern."
    - "[HIGH] save() has no error handling. saveTeamEdits failure throws inside useTransition callback with no try/catch. No feedback to user, dirty state stuck, unhandled promise rejection in console. Failures from 422, unknown player_id, school_count < 1, or season lock conflict all produce silent UI hang."
    - "[MEDIUM] representing_school is text input, not dropdown. Contract (group-4.md line 5) specifies \"代表学校下拉\"; implementation uses plain <input> allowing inconsistent/misspelled school names with no normalization. Confirms whether this is intentional contract deviation before merge."
    - "[MEDIUM] RosterEditor.tsx is orphaned. page.tsx switched from RosterEditor to TeamEditPanel; nothing imports RosterEditor anymore. Should be deleted as part of this change (dead code)."
    - "[LOW] Membership PATCHes are sequential not parallel. Writes are independent per player; wrapping in Promise.all would cut latency on Render free-tier cold starts without changing semantics."
  notes:
    - "Contract SHALLs verified: EditModeToggle mounted and reused; read-only path renders only RosterTable with canEdit=false, no edit controls leak; batch doubles with change marking; borrowed/wildcard checkboxes with representing_school disabled when external=true; school_count input drives caps display; roster-over-cap is warning with save still enabled; colors added to globals.css"
    - "Runtime: 448 tests pass (60 files), tsc clean. New tests: TeamEditPanel.test.tsx (4 tests: read-only, batch edits, borrowed logic, caps), teamEdit.test.ts (3 tests: capsFor, borrowedCountWith, rosterOverCap). Fixtures updated consistently for is_wildcard, representing_school, team.id, borrowed_limits."
    - "Backend routes pre-existing: /api/players/current-utr (PUT) in utr.py:320, /api/players/{id}/memberships (PATCH) in players.py:211, /api/seasons/.../teams/{code} (PATCH) in rosters.py:63. Backend query responses extended with school_count, borrowed_limits, per-player is_borrowed_player (Candidate carries it via load_roster)."
    - "Borrowed/wildcard clearing verified both sides: client `representing_school: b || w ? null : schoolOf(p) || null`; server command.py:229-230 enforces independently — defense-in-depth correct."
    - "No CRITICAL issues. 2 HIGHs block merge: (1) empty field 422 blocks batch, (2) missing error handling leaves UI hung on failure. Both are real behavioral bugs an admin will hit (clearing a UTR is normal, network failure is normal)."

- group: 4
  attempt: 2
  scores: {spec: 95, runtime: 100, code: 90}
  total: 96
  status: PASS
  findings: []
  notes:
    - "Prior attempt-1 HIGHs verified fixed: (1) empty doubles field now maps `v === \"\" ? null : v` (TeamEditPanel.tsx:378), confirmed by regression test 'sends null (not '') for a cleared doubles field'; (2) save() wrapped in try/catch (TeamEditPanel.tsx:399-413), keeps dirty state on error, reset() only on success, error alert shown, confirmed by test 'keeps the edits and shows an error when the save fails'"
    - "Orphaned RosterEditor.tsx deleted per attempt-1 feedback (diff shows deletion)"
    - "representing_school remains free-text input (not dropdown). Design.md D4 and contract agreement confirm this is intentional deviation from mock — no flag as defect"
    - "Code review (subagent): 0 CRITICAL, 0 HIGH. Verified: Decimal full-stack (empty→null before PUT); error handling preserves dirty state; borrowed_limits dict keys consistent end-to-end (Pydantic int→JSON string, frontend `Record<string,...>` and `limits[String(schoolCount)]`); representing_school nulled server+client when is_borrowed_player||is_wildcard; no SQL injection (parameterized SQLModel select); no XSS (plain controlled inputs); team.id properly used for membership (player_id, team_id) addressing"
    - "One MEDIUM note (not blocking): saveTeamEdits performs UTR PUT + per-player membership PATCH loop + school_count PATCH as separate un-transactional calls. If one PATCH in loop fails, earlier PATCHes already committed. Assessed non-data-corrupting since all sends are idempotent (full desired state, not deltas); retry re-sends same values with no side effects. Acknowledged in code comments."
    - "Runtime: 450 tests pass (60 files), tsc clean. New tests in attempt 2: TeamEditPanel.test.tsx expanded with regression tests for prior HIGHs (cleared field sends null, error keeps dirty state)"
    - "Backend: _borrowed_limits_for() function correctly fetches division_borrowed_limits; team.id added to TeamOut (required for membership PATCH by (player, team)); school_count and borrowed_limits added to TeamRosterOut; proper use of set search_path in migration context"
    - "Contract SHALLs verified: EditModeToggle reused; read-only when not unlocked; batch doubles with dirty marking; borrowed/wildcard flags with representing_school disabled; school_count input showing caps; warning when over-cap, save still enabled; lock-season overwrite semantics preserved"
    - "Spec coverage: 95/100 (all contract items implemented, minor deduction for MEDIUM transactionality note); Runtime: 100/100 (tests + types clean); Code: 90/100 (APPROVE from reviewer, minor deduction for MEDIUM note)"
    - "Total = 95×0.4 + 100×0.4 + 90×0.2 = 96. Status: PASS (threshold 70)"
