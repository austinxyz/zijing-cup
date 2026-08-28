# Eval Log — roster-import

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 92}
  total: 96.4
  status: PASS
  findings:
    - "schema: All SHALL statements implemented correctly; tables in zijing_cup schema, none leaked to public"
    - "is_borrowed_player: Correctly nullable with no default in both migration and ORM; test_borrowed_player_flag_has_no_default and test_borrowed_player_flag_is_three_state both pass"
    - "utr_profile_id: Partial unique index (team_id, utr_profile_id) where not null correctly scoped to team; test_profile_id_is_unique_within_a_team and test_same_profile_id_may_appear_in_both_divisions both pass"
    - "set search_path: Migration line 13 opens with 'set search_path to zijing_cup, public;'"
    - "daily_utrs: Stored as numeric(5,2)[] array, not separate table; test_daily_utrs_is_an_array passes"
    - "rating_class: Nullable in both schema and ORM; test_rating_class_defaults_to_unset passes"
    - "source_note: Nullable and preserved as-is text; no normalization"
    - "No players table: Snapshot model with (team_id, last_name, first_name) uniqueness only; design D1 correctly implemented"
    - "Tests: 15/15 pass (8 schema + 7 roundtrip); all invented names, no real roster data in repository"
    - "Code review: Zero CRITICAL/HIGH issues; two LOW observations (missing gender test, contract prose clarification)"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 85}
  total: 97
  status: PASS
  findings:
    - "spec: All SHALL statements from contract fully implemented and verified"
    - "spec: Unrated → None with / Appeal suffix handled correctly"
    - "spec: Daily columns matched by prefix with named scalars explicitly excluded"
    - "spec: Blank daily samples dropped, not stored as 0"
    - "spec: Pseudo-teams skipped and reported in result"
    - "runtime: All 17 tests passing (rating classes, daily values, pseudo-teams, columns)"
    - "code: Meets all Code section requirements (Unrated NULL, no Notes inference, / Appeal preserved, prefix matching, pure function)"
    - "code: Two MEDIUM issues noted by reviewer: (1) Decimal('NaN'/'Infinity') not caught; (2) csv.DictReader can raise uncaught on malformed line. These are edge cases not in contract scope but should be addressed before production."

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "spec: All 10 SHALL statements from contract verified; idempotence, field ownership, shared comparison, ranking CSV read-only all correct"
    - "field-ownership: SOURCE_FIELDS defines CSV-owned columns; is_borrowed_player, utr_profile_id, and Unrated rating_class are never written by importer"
    - "comparison-function: Both check_rosters() and load_rosters() route through single _compare() function; no duplicate logic that could diverge"
    - "ranking-csv: parse_ranking_teams() returns set for reconciliation only; TPI values never persisted to database; test_ranking_values_are_never_stored verifies"
    - "duplicate-detection: _reject_duplicates() raises ValueError as first statement in _compare(); called before any _write() path; test_duplicate_name_on_one_team_aborts_the_import confirms batch abort"
    - "rating-class: RATING_CLASS_BY_STATUS deliberately omits Unrated; _rating_class_update() returns None for Unrated, leaving hand-set values untouched"
    - "runtime: All 29 tests pass (4 FirstImport, 5 Idempotence, 5 FieldOwnership, 4 CheckMode, 4 Reconciliation, 7 RankingReconciliation)"
    - "code: Code-reviewer found zero CRITICAL/HIGH/MEDIUM issues; all five critical scrutiny points verified correct; only 1 LOW: unused Decimal import at line 21"

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: Both SHALL statements satisfied — two read-only endpoints provided, no write methods exposed; all 5 spec scenarios verified (team list 200, roster 200, 3× 404 cases)"
    - "endpoints: GET /api/seasons/{year}/divisions/{code}/teams + GET /api/seasons/{year}/divisions/{code}/teams/{team_code}/roster both implemented and tested"
    - "roster-fields: All required fields present in response (match_utr, dutr_status, rating_class, source_note, is_borrowed_player, utr_profile_id, daily_utrs, gender)"
    - "nullable-serialization: rating_class, is_borrowed_player, utr_profile_id all serialize as JSON null when unset, not defaulted to values; verified by test_undetermined_rating_class_is_null_not_guessed, test_borrowed_player_flag_is_three_state, test_profile_id_is_exposed_when_set"
    - "unknown-team-404: test_unknown_team_is_404_not_an_empty_roster confirms 404 returned, not empty player list"
    - "grouped-query: list_teams() uses single select(Team.code, func.count(RosterEntry.id)).join(...).group_by(Team.code) query; no N+1"
    - "no-write-methods: test_no_write_route_exists reads app.openapi()['paths'] and asserts zero POST/PUT/PATCH/DELETE methods; test_roster_routes_are_registered prevents guard from passing vacuously"
    - "auth: Both routes protected by X-Backend-Secret middleware; test_team_list_requires_the_shared_secret and test_roster_requires_the_shared_secret pass"
    - "runtime: All 14 tests passed (4 team list, 6 roster, 2 access control, 2 schema validation)"
    - "code-review: Zero CRITICAL/HIGH/MEDIUM/LOW issues; all five critical scrutiny points independently verified against source code and live test execution"
