# Eval Log — read-path-switch

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 — Attempt 1

- **group**: 1
- **attempt**: 1
- **scores**:
  - spec: 95
  - runtime: 100
  - code: 90
- **total**: 96
- **status**: PASS (96 >= 80 threshold)
- **findings**:
  - Spec: All four-step chain requirements correctly implemented; D1–D3 all met; one test gap on case-insensitivity
  - Runtime: All 10 tests pass, 0.01s, no import errors, no database access
  - Code: No CRITICAL/HIGH issues; one MEDIUM (case-insensitivity not tested); one LOW (unique constraint assumption documented)
- **code_review_summary**: APPROVE — implementation correctly follows all four contract requirements (D1–D3). One MEDIUM test-coverage gap (case-insensitive status matching) worth closing before merge but does not block.

## Group 2 — Attempt 2

- **group**: 2
- **attempt**: 2
- **scores**:
  - spec: 100
  - runtime: 100
  - code: 95
- **total**: 99
- **status**: PASS (99 >= 80 threshold)
- **findings**:
  - Spec: All SHALL statements correctly implemented. Data source fully switched to player registry (D7 ✓). Response shape preserved with new fields correctly optional (D5/D5b ✓). dutr_status/source_note/daily_utrs hardcoded null/empty (D5 ✓). rating_class from status, under_appeal separate (D6 ✓). Players with no derivable UTR are correctly retained in roster, not dropped (spec "缺值队员仍在名单里" ✓). Team list count matches roster length (spec consistency ✓). Gender read from Player table not snapshot (D7 ✓).
  - Runtime: All 25 tests pass (0.99s, no errors). Fixture correctly builds on registry tables without roster_entries. Tests cover frozen value, prior-season derivation, no-value-anywhere, registry-only player, count consistency, null fields, gender bucketing.
  - Code: No CRITICAL/HIGH issues. Optional typing for dutr_status/match_utr/origin/origin_year matches contract exactly. list_teams() correctly remains single query with LEFT JOINs, grouped by gender, ordered by code. get_team_roster() correctly batches season_utrs query, delegates to resolve_match_utr(), keeps players with None values. Sorting by resolved match_utr correct (nulls last, then -utr desc, then name asc). is_borrowed_player/utr_profile_id correctly placed on membership vs player. No write endpoints added. One LOW observation (test data naming) is non-blocking readability note.
- **code_review_summary**: APPROVE — No CRITICAL or HIGH issues. All contract decisions (D5/D5b/D6/D7) and spec SHALL statements correctly implemented. Solid test coverage with regression guard against N+1 queries. Ready to ship.

## Group 3 — Attempt 1

- **group**: 3
- **attempt**: 1
- **scores**:
  - spec: 100
  - runtime: 100
  - code: 92
- **total**: 98
- **status**: PASS (98 >= 80 threshold)
- **findings**:
  - Spec: All contract SHALL/MUST statements correctly implemented. Key prefix (D4 ✓): `KEY_PREFIX="p"` applied consistently at candidate construction. Old format rejection (D4 ✓): `_reject_old_keys()` detects bare integers via regex fullmatch, raises specific stale-link message in both lock and exclude paths. Three counters (missing/estimated/unresolved) correctly tracked during load_roster: missing counts resolved==None cases then continue; estimated counts non-FROZEN origins; unresolved counts is_unresolved flag independently. Roster and lineup readers use same resolve_match_utr() call (D1 ✓). No silent drops: missing-UTR players counted and excluded, not silently omitted. Spec compliance on four-step chain, origin marking, player reportage all verified by test fixtures EXTRA cases.
  - Runtime: All 24 tests pass (1.34s). Fixture correctly builds new model (Player/PlayerSeasonUtr/PlayerTeamMembership) with explicit test cases for derived/unresolved/missing scenarios. Cleanup dependency-ordered across new tables. Test suite covers: key prefixing (TestPlayerKeys), counting (TestWhoIsAndIsNotInTheSearch), roster-lineup agreement (TestOneNumberPerPlayer), stale link rejection (TestStaleLinks). No import errors, no database access beyond test session.
  - Code: No CRITICAL/HIGH issues. Code-reviewer approved. D1 compliance verified: resolve_match_utr reused identically, not duplicated. D4 compliance verified: `_OLD_KEY.fullmatch()` with specific error message in both lock and exclude validation. Key construction, origin enum comparison, counter logic all correct. One MEDIUM observation from reviewer (duplicated roster-assembly logic around the resolve call in both lineups and rosters modules, not just the resolve logic itself) is non-blocking since the critical deduplication (D1 — resolve_match_utr itself) is done correctly; routing/membership-loading duplication noted for future opportunistic cleanup. Two LOW observations (regex comment fragility, test assertion redundancy) are purely editorial and do not affect correctness.
- **code_review_summary**: APPROVE — No CRITICAL or HIGH issues. D1–D4 and all contract SHALL statements correctly implemented. Core deduplication (resolve_match_utr) properly reused per D1; three counting fields correctly tracked; old key detection works as specified. Test coverage comprehensive including edge cases (missing UTR, derived, unresolved, stale links). Ready to ship.

## Group 4 — Attempt 1

- **group**: 4
- **attempt**: 1
- **scores**:
  - spec: 100
  - runtime: 100
  - code: 100
- **total**: 100
- **status**: PASS (100 >= 80 threshold)
- **findings**:
  - Spec: All SHALL statements correctly implemented. Refusal mechanism (D8 ✓): Early return 2 at line 50 before load_rosters() prevents all writes; tests verify row count unchanged. Explicit switch (D8 ✓): `--i-know-it-is-not-read` in argparse, visible in shell history not env var. Notice on both paths (D8 ✓): NOT_READ_NOTICE printed unconditionally before override check; tests verify presence in refuse and override cases. Message clarity (✓): Chinese message directly states "这些行不会被任何页面读取" and directs to "队员管理界面改". Both contract scenarios tested: test_it_refuses_by_default (refusal path) and test_the_explicit_override_still_says_it (override path).
  - Runtime: All 35 tests pass (1.65s total); includes 2 new test cases validating refusal and override paths. Test fixtures create fresh CSV; assertions verify exit code, data writes, and message presence; no cross-test state contamination.
  - Code: No CRITICAL/HIGH/MEDIUM issues. Code reviewer approved without exceptions. Hard exit at line 50 before file processing prevents any silent data writes. Output routing correct (notice → stdout, refusal → stderr). Comment explains rationale (line 44-45). Exit codes appropriate (2 for refuse, 0 for override). Notice redundancy in override case is correct per spec, not a defect.
- **code_review_summary**: APPROVE — No CRITICAL or HIGH issues. D8 correctly implemented: explicit flag in command history, hard refusal before writes, notice printed in both paths, clear messaging about where to modify roster. Both required test scenarios passing. Ready to ship.

## Group 5 — Attempt 1

- **group**: 5
- **attempt**: 1
- **scores**:
  - spec: 100
  - runtime: 100
  - code: 100
- **total**: 100
- **status**: PASS (100 >= 70 threshold)
- **findings**:
  - Spec: All SHALL statements correctly implemented. Estimate labels with year (✓): estimateLabel() returns `估算 · <年份> 参赛值` for prior_season, `估算 · 当前已认证值` for current_doubles; tests verify both patterns with line 271–291. Rating classes (✓): CLASS_LABEL maps verified→已认证, committee→委员会审定, captain→队长评定; null→待定; all tested. Appeal format (✓): SourceCell displays `· Appeal` beside class when underAppeal true (line 220); tests verify ("keeps Appeal beside the class", line 248–262). No old status words (✓): dutr_status now always null; tests verify no Rated/Projected/Unrated appear ("never prints...status word", line 229–246). Current UTR maintenance note (✓): "当前 UTR 由人工维护，未与 UTR 官网同步" on line 44 with neutral styling (bg-surface-muted, border-border). Current UTR columns (✓): 当前单打/当前双打 headers (lines 63–64); CurrentUtrCell component shows value+status or "—"; tests cover all scenarios (lines 344–391). No-value display (✓): "无参赛 UTR" badge with neutral variant when match_utr null (line 161); tests verify neutral, not warning (line 312–341). Frontend text, backend enums (✓): estimateLabel() builds Chinese from origin/origin_year; API defines origin as string|null (enum). Color tokens (✓): Estimate badges use warning-subtle; description uses neutral; Badge component added neutral variant (line 32 badge.tsx); no new tokens; warning color adjusted #8a6508 for contrast.
  - Runtime: All 24 RosterTable tests pass (1.00s), including new test suites: "derived participation UTRs" (6 tests, lines 270–341) and "current UTRs" (4 tests, lines 344–391). TypeScript compilation: clean, no errors. Tests exercise frozen values, prior-season derivation, current-doubles derivation, no-value-anywhere cases, appeal display, rating class mapping, current UTR display with status, empty-column behavior with maintenance note. Backend test fixture setup correctly populates singles_utr/doubles_utr with test values (lines 41–44). Frontend fixture updated to new schema (origin/origin_year/is_unresolved/under_appeal/rating_class instead of dutr_status).
  - Code: No CRITICAL/HIGH/MEDIUM/LOW issues found by code-reviewer. APPROVE verdict. Verification: Backend RosterPlayerOut fields (singles_utr, singles_status, doubles_utr, doubles_status) map to actual Player model columns; frontend RosterPlayer type changes do not leak into other consumers (LineupControls uses separate LineupPlayer type, no null-dereference risk); table column indices in tests match actual &lt;Th&gt; order; null handling consistent with project convention (null is a real state, not default) and tested in both backend (test_roster_api.py) and frontend (RosterTable.test.tsx); color-contrast changes documented with computed ratios (#8a6508 = 4.89:1); new &lt;p&gt; note sits inside scroll wrapper, does not reintroduce content-clipping pitfall.
- **code_review_summary**: APPROVE — No CRITICAL or HIGH issues. All contract SHALL statements (estimate format with year, rating classes, appeal display, current UTR columns, maintenance note, color tokens) correctly implemented. Backend and frontend schemas properly aligned; null handling consistent; comprehensive test coverage across new functionality; color contrast documented. Ready to ship.

## Group 6 — Attempt 1

- **group**: 6
- **attempt**: 1
- **scores**:
  - spec: 100
  - runtime: 100
  - code: 100
- **total**: 100
- **status**: PASS (100 >= 70 threshold)
- **findings**:
  - Spec: All SHALL statements from contract (group-6.md) correctly implemented. Missing-UTR notice (✓): "本队 N 人因缺少参赛 UTR 未参与计算" on neutral tier, hidden when count=0; verbatim match to mocks section 3. Unresolved notice (✓): "本结果含 N 名参赛 UTR 未裁决的队员，按较大值计算" on warning tier, hidden when count=0; verbatim match. Individual number mark (✓): "估算" badge on warning tier displayed for non-frozen origins; verbatim match. Candidate card summary (✓): "含 N 个估算值，合法性待总表确认" on warning tier displayed when estimates>0; verbatim match. Ceiling mark (✓): "含估算值" on warning tier displayed when top candidate has estimates; verbatim match. Stale link message (✓): "这个链接是旧格式（队员编号已变），请重新选择锁定的搭档" on neutral tier; verbatim match; not shown as danger. Stale link handling (✓): hasStaleKeys() detects bare integers, blocks constrained search, shows StaleLink component; does not silently drop locks and render full results. All color tiers verified: warning (estimate, unresolved, ceiling mark), neutral (missing-UTR, old-link). All fields in API response (origin, origin_year, is_unresolved) correctly wired backend→frontend and displayed on page and candidates.
  - Runtime: All 44 frontend tests pass (6 test files, 1.26s). TypeScript compilation clean (0 errors). All 26 backend tests pass (1.39s). Comprehensive coverage: TestPerPlayerProvenance verifies origin/origin_year/is_unresolved populated correctly; stale-key tests verify bare-integer detection and message; LineupResults test suite covers missing-UTR, unresolved, estimate-marking, ceiling-marking, stale-key display scenarios. All assertions pass without modification.
  - Code: Code-reviewer approved with severity NONE (no findings). Backend: provenance dict correctly threaded through LoadedRoster→_player_out(); indexed access (not .get with default) ensures mis-wiring crashes at module boundary, not silently. Frontend: all three new fields on LineupPlayer; component rendering logic matches mock requirements; hasStaleKeys() regex correctly identifies old format; StaleLink component conditionally rendered per contract. Type safety verified: UtrOrigin enum properly serialized; all origin values in tests match enum members; is_unresolved boolean correctly used in render conditions; origin_year optional as specified.
- **code_review_summary**: APPROVE — No CRITICAL or HIGH issues. All contract SHALL statements and mocks verbatim strings correctly implemented. Provenance tracking properly wired backend→frontend. Stale-link detection and error handling per spec. Color tiers verified. Comprehensive test coverage. Ready to ship.
