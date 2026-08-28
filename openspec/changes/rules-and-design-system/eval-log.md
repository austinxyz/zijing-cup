# Eval Log — rules-and-design-system

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 95}
  total: 97
  status: PASS
  findings:
    - "Spec: All four base components (Button, Card, Badge, Input) implemented with correct token usage"
    - "Spec: No hardcoded colors in components; all use Tailwind token classes"
    - "Spec: No new runtime dependencies added to package.json"
    - "Runtime: All 18 tests pass, build succeeds, no TypeScript errors"
    - "Code: cn utility is hand-written 3-line implementation without external dependencies"
    - "Code: Component APIs match ai-course-management (Button variants & sizes correct)"
    - "Code: Font configuration includes full CJK coverage via unicode-range (verified in built output: 107 woff2 files, 4.7MB, Han character ranges present)"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 98}
  total: 99
  status: PASS
  findings:
    - "Spec: All five spec requirements perfectly met (four tables in zijing_cup schema, cap nullable, buffer_per_line/_total separate, eligibility_limits with line whitelist, scoring_mode stored)"
    - "Runtime: All 11 tests pass (6 schema shape + 5 ORM roundtrip); all required tables in correct schema, none leaked to public"
    - "Code: Migration starts with set search_path to zijing_cup, public; zero CRITICAL/HIGH issues from code review"
    - "Code: NULL cap and nullable restricted_to_lines round-trip correctly through ORM; Decimal precision preserved for exact cap values"

- group: 3
  attempt: 1
  scores: {spec: 88, runtime: 100, code: 65}
  total: 88
  status: PASS
  findings:
    - "Spec: All explicit SHALL requirements met—import command loads TOML, --check mode reads-only with proper exit codes, differences reported by season/division/field"
    - "Spec: Shared comparison function verified between check_rules() and load_rules() by test_check_and_import_agree_on_what_differs"
    - "Spec: Idempotency demonstrated by test_reimporting_the_same_seeds_changes_nothing and test_reimporting_does_not_duplicate_rows; PRIMARY KEYS included in snapshot to catch row churn"
    - "Spec: Seeds are authoritative source of truth; rule sets in DB but not seeds are deleted"
    - "Runtime: All 16 tests pass including idempotency (2), drift detection (3), shared comparison (1), and functional scenarios (10)"
    - "Code (HIGH): Non-convergent writes when division files for same season_year disagree on edition_name—Season is a shared row written multiple times per season, creating oscillation risk. Does not manifest with current seeds (2025 pair agree, 2026 pair agree) but violates idempotency guarantee in edge case"
    - "Code: Comparison function correctly uses frozen dataclasses for structural equality, avoiding hand-written field walks"
    - "Code: Does NOT use ON CONFLICT DO UPDATE; uses compare→delete→insert pattern as required"
    - "Code (MEDIUM): No test coverage for conflicting season fields or duplicate division definitions—plausible authoring mistakes given 'hand-edited seed files' design"
    - "Code (LOW): Redundant parse_seed_dir() calls in main()—check_rules() called once for removal preview, then load_rules() called again internally"
  fix_tasks:
    - "3.F1 FIX — Validate at parse time that all DivisionSpec sharing same season_year have identical edition_name, or move edition_name out of per-division comparison into dedicated Season-level write step to eliminate oscillation risk"
    - "3.F2 FIX — Add test case for conflicting edition_name values in same-year divisions to prevent regression"
    - "3.F3 FIX — Refactor main() to reuse Report from check_rules() instead of re-parsing; avoid double I/O"

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "Spec: All contract requirements verified—endpoint returns 200 with complete rule set for valid season/division, 404 for unknown season, 404 for unknown division code"
    - "Spec: Response includes all required fields—lines with caps/points, both buffer allowances (buffer_per_line and buffer_total separate), eligibility limits with optional line whitelist, scoring_mode, partner_gap_max, mens_doubles_must_be_ordered"
    - "Spec: Open lines serialize as JSON null (not sentinel); verified via test_open_lines_serialise_as_null_not_a_sentinel with real seeded gold division"
    - "Spec: No write endpoints exist; test_no_write_route_exists_for_rules verifies no POST/PUT/PATCH/DELETE methods present"
    - "Runtime: All 13 tests pass—includes 200 response test, both 404 paths, auth requirement, field coverage (caps, points, buffers, limits, scoring mode, constraints), past season data, and endpoint registration assertion"
    - "Code: Query pattern verified as 3-4 total queries (Division, DivisionLine, DivisionEligibilityLimit, Season pk-lookup) with no N+1 pattern—each filtered by division_id"
    - "Code: Read-only implementation confirmed—only GET route, protected by X-Backend-Secret middleware (registered first in main.py line 20), test verifies 401 without auth"
    - "Code: No caching present (as required); tests load real seeds via load_rules() importer, not hand-built fixtures"
    - "Code (MEDIUM): Fragile shared test sentinel—test_rules_api.py and test_rules_models_roundtrip.py both use year 1999 independently for opposite purposes (one requires non-existence, other creates/deletes), creating race condition under pytest-xdist without proper test isolation"
    - "Code (LOW): Commit message states 'three queries' but code issues four (Session.get(Season, year) is additional, though cheap PK lookup); Season lookup may be redundant given Division filter guarantees season_year"
    - "Code (LOW): Path params year/code have no explicit validation—rely on FastAPI type coercion and generic 404 for malformed input"
  fix_tasks:
    - "4.F1 FIX — Separate sentinel year constants in test suite—use NON_EXISTENT_YEAR = 1900 for 'must never exist' assertions, reserve TEST_YEAR = 1999 only for roundtrip module's private scratch space; centralize in shared test-support module to prevent collision"
    - "4.F2 FIX — Verify whether Session.get(Season, year) lookup is necessary given Division query already filters by season_year; consider removing if redundant to reduce query count"
