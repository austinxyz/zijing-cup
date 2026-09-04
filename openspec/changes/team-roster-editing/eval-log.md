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
