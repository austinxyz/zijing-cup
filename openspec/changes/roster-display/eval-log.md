# Eval Log — roster-display

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "migration: `set search_path to zijing_cup, public;` properly qualified"
    - "display_name: nullable, no default, matches contract spec"
    - "importer: SOURCE_FIELDS excludes display_name, team upsert never updates fields"
    - "test_reimport_keeps_the_hand_set_team_name: uses differing CSV (match_utr change), correctly triggers write path"
    - "test_check_does_not_report_the_team_name_as_drift: confirms --check is clean with hand-set name"
    - "roundtrip tests: named team persists, unnamed team reads as None (not empty string)"
    - "code review: zero CRITICAL/HIGH, all 5 contract requirements verified"
  fix_tasks: []

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "seed architecture: scope_of() correctly derives scope from files, not entries"
    - "scoping bug fix: read_current filters (year, division) in scope; _apply checks scope before touching any team"
    - "removal semantics: teams absent from seed have names cleared, seed is source of truth"
    - "unmatched entries: reported but non-fatal; test_unmatched_entry_does_not_block_the_others confirms"
    - "idempotent comparison: _apply only writes when display_name != target"
    - "check mode: reuses same compare() function; exits 0 on clean (even with unmatched), 1 on drift"
    - "cross-division safety: test_import_does_not_touch_divisions_the_seed_does_not_describe proves no gold names cleared by silver import"
    - "empty division file valid: 2025-gold.toml [teams] empty yet describes gold division for clearing"
    - "windows encoding: configure_stdout() handles cp1252 -> utf-8 reconfiguration"
    - "type safety: frozen dataclasses, all function signatures annotated, no mutations"
    - "test coverage: 21 tests span parse, import, removal, unmatched, check mode, CLI encoding — all green"
  fix_tasks: []

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: all SHALL/MUST met—two read-only endpoints, gender three-bucket (M/F/unknown), display_name in both responses, no write methods"
    - "runtime: 20/20 tests pass including gender breakdown, three-bucket sum, single-query verification (2 SELECTs), display_name in endpoints"
    - "query design: grouped by (Team.code, Team.display_name, RosterEntry.gender) with isouter join; aggregates in app layer; correct"
    - "empty roster handling: outer join returns one row (code, name, null_gender, 0) per empty team; accumulator leaves all counts at 0"
    - "ordering: query.order_by(Team.code) + dict insertion-order preservation + list(summaries.values()) maintains code sort"
    - "no write methods: test_no_write_route_exists reads app.openapi()[\"paths\"], correctly asserts no POST/PUT/PATCH/DELETE"
    - "test coverage: fixture includes null-gender player (API-BETA,东,方朔,,Rated...); display_name manually set on API-ALPHA; three-bucket assertions"
    - "code review: CRITICAL=0, HIGH=0, MEDIUM=1 (stale duplicated comment lines 111-114), LOW=2 (informational: mutation pattern, gender-check DB constraint dependency); APPROVED"
    - "type safety: complete; immutability note flagged but non-blocking (local accumulator pattern acceptable for this use case)"
    - "security: no SQL injection (SQLModel select/func), no secrets, auth unaffected, display_name semantics (null not echoed code) correct"
  fix_tasks: []

- group: 4
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 95}
  total: 97
  status: PASS
  findings:
    - "url_source_of_truth: SelectedTeamList.tsx uses useSelectedLayoutSegment(), never useState; TeamList marks selection via aria-current not link"
    - "empty_state: teams/page.tsx renders prompt 'from-left-select-team', no table, no redirect; test confirms queryByRole('table') is null"
    - "gender_buckets: TeamSummary has men_count, women_count, unknown_gender_count; unknown only renders when > 0 (line 723-725)"
    - "navigation: 队伍 is NavLink to /[season]/[division]/teams (no longer marked unavailable); 分析 remains PendingNavItem disabled"
    - "secrets_security: grep confirms BACKEND_URL/BACKEND_SECRET only in lib/api.ts and lib/api.test.ts; getDivisionTeams/getTeamRoster server-side only"
    - "architecture: TeamList in teams/layout.tsx (survives failed roster fetch under teams/[code]); empty state in page.tsx; error.tsx replaces only content"
    - "tests: all 66 pass (13 test files); active sidebar tests mark 队伍 on teams segment; team list tests verify gender buckets, unknown-gender conditional, and url selection"
    - "code_review: 0 CRITICAL, 0 HIGH, 0 MEDIUM; 1 LOW note (non-issue: players variable used for header summary); verdict APPROVE"
    - "scope_note: mobile/375px layout removed per spec revision (verified running app has never had narrow shell); both specs and contract already updated"
  fix_tasks: []

- group: 5
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 88}
  total: 98
  status: PASS
  findings:
    - "contract_check_a: Unrated player renders 待定, never 自评 — CLASS_LABEL intentionally omits Unrated; SourceCell shows 待定 badge only for null class; test_never_labels_an_unclassified_player_自评 confirms absence"
    - "contract_check_b: '/ Appeal' suffix doesn't change class label, survives verbatim — classLabel(status).split('/')[0].trim() for classification, full status string rendered unmodified; test_ignores_an_appeal_suffix_when_naming_the_class passes"
    - "contract_check_c: table renders players in order received, no re-sorting — players.map() used directly with comment 'Rendered in the order received'; test_keeps_the_order_it_was_given asserts tie-order preservation with equal match_utr"
    - "contract_check_d: not-found scoped to route, sidebar and team list survive — not-found.tsx and error.tsx are segment-level (not global), layout.tsx preserves TeamList; framework correctly keeps shell intact"
    - "contract_check_e: match_utr rendered as decimal string, never parsed to float — RosterPlayer.match_utr typed string; no Number()/parseFloat() in render; test_shows_the_participation_utr_exactly_as_given asserts '10.25' rendered unchanged"
    - "runtime_all_pass: 16 test files, 86 tests, 0 failures; contract's four specific assertions all covered (sort order, three UTR sources, no 自评, 404 for unknown team)"
    - "404_status_verified: page.tsx calls notFound() on null roster; not-found.test.tsx includes regression test guarding against loading.tsx reintroduction"
    - "no_loading_tsx: confirmed absent; commit message and spec update justify this tradeoff (Suspense boundary prevents notFound() from returning 404 when loading.tsx present)"
    - "code_review_verdict: APPROVE — no CRITICAL or HIGH issues; all 8 contract SHALL requirements met and tested"
    - "medium_findings_2: (1) warning-subtle badge hardcodes hex #ecd9a4/#fbf5e6 instead of design tokens like danger-surface/danger-border already in globals.css; (2) error.tsx drops error prop, no logging or error reporting on fetch failure"
    - "low_findings_2: (1) no error.test.tsx covering retry button, message, error logging; (2) empty roster (0 players) path has no dedicated test, only the not-found path tested"
    - "test_quality: tests are well-targeted at contract language (order stability, appeal suffix, 自评 absence, gender null, decimal string); page.test.tsx correctly mocks notFound() to throw"
    - "architecture: clean separation—page.tsx (server, fetch+notFound) → RosterTable.tsx (pure render) → SourceCell (classification logic); no client/server violations"
    - "all_scope_checks_pass: (a) Unrated→待定, no 自评 ✓ | (b) /Appeal survives ✓ | (c) no re-sort ✓ | (d) shell survives 404 ✓ | (e) string not float ✓"
  fix_tasks: []
