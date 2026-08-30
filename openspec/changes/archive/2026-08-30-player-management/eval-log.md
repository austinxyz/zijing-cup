# Eval Log — player-management

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "code: season_locks table is additive (beyond three-table contract scope) but isolation is correct; no CRITICAL/HIGH issues"
    - "code: lock enforcement not yet implemented — known follow-up, contract does not require it in this batch"
    - "code: cascade-delete on players silently removes locked-season history — acceptable for now (merge/split are future work)"
  fix_tasks: []

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALL requirements satisfied — grouping by normalized name, one membership per row, (player, season) UTR per unique combo, conflicts preserved unresolved with both values, idempotent"
    - "runtime: 20/20 tests pass (identity key normalization, grouping, conflict detection, field mapping, database integration, idempotence, check mode)"
    - "code: Pure logic isolation (merge_rules.py) is testable and well-separated from database operations; command pattern mirrors load_rules/load_rosters"
    - "code-minor: Unused rating_class extraction (harmless); command entry point unclear in production invocation path"
    - "code-minor: Test fixture does not pre-seed extra teams to verify skipping behavior; Decimal type choice not documented"
    - "code-review: No CRITICAL/HIGH issues; schema migration properly scoped with search_path, status column correctly nullable"
  fix_tasks: []

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: All SHALL/MUST requirements met — subtractive model, method-based check, separate conditions, fail-closed on missing ADMIN_SECRET"
    - "runtime: 32/32 tests pass (admin credential validation, missing secret lockout, read unaffected, undeclared routes auto-protected, real write surface)"
    - "code: Middleware implements five stated security properties correctly; secrets.compare_digest used; no per-route dependencies; cannot be forgotten"
    - "code-review: No CRITICAL/HIGH issues (code-reviewer approved with MEDIUM and LOW findings)"
    - "code-minor: test_roster_api.py:284 assert tautology (assert probed >= 0) does not detect regressions, but real guard exists in test_admin_auth.py; test_rules_api.py:318 uses substring match instead of segment match for '/rules'"
  fix_tasks: []

- group: 4
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 98}
  total: 99.6
  status: PASS
  findings:
    - "spec: All 4 SHALL requirements verified — player independence (created without team, deletable when empty), membership add/remove (endpoints exist and work), remove doesn't delete player (test_leaving_a_team_keeps_the_player_and_their_season_utrs passes), prefill→override with source change (test_a_season_utr_can_be_prefilled_then_overwritten passes)"
    - "runtime: All 16/16 tests pass — 5 CRUD tests (create, read, edit, delete, search), 4 membership tests (join, dual-division, leave, duplicate refused), 3 season UTR tests (prefill/override, isolation, undecided), 4 error tests (404, malformed 4xx)"
    - "code: Query/command/router separation matches D6; routes read DB + call pure functions + assemble responses; conflict/uniqueness logic in command layer; season_lock guard prepared for group 5; all Decimal throughout"
    - "code-review: No CRITICAL/HIGH issues; routes delegate business logic correctly; error handling is explicit; input validation via Pydantic vocabularies (gender M/F, UTR statuses)"
    - "code-minor: add_membership endpoint returns minimal {id} response rather than full MembershipOut; consistent with REST sub-resource creation conventions but slightly less uniform than other endpoints"
  fix_tasks: []

- group: 5
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 100}
  total: 100
  status: PASS
  findings:
    - "spec: All 8 SHALL requirements verified — merge preserves both sides' memberships and UTRs on one person (test_everything_from_both_sides_ends_up_on_one_person), unresolved marking with both values kept and not discarded (test_two_different_values_in_one_season_become_unresolved), conflicts don't block merge (test_a_conflict_does_not_stop_the_merge), split moves exactly named rows and leaves rest (test_the_chosen_rows_move_and_the_rest_stay), split rejects foreign rows (test_a_row_that_belongs_to_someone_else_cannot_be_moved), unresolved reads larger value with status indicated (test_the_larger_candidate_is_what_gets_read), ruling settles contested season with third value allowed (test_a_third_value_is_allowed), season lock refuses changes with message naming season (test_a_locked_season_refuses_a_season_utr_change shows message contains season year), cannot delete player with locked records (test_a_player_with_records_in_a_locked_season_cannot_be_deleted), can delete player without locked records (test_a_player_with_no_locked_records_can_still_be_deleted)"
    - "runtime: All 26 tests pass (20 in test_players_merge.py + 6 in test_players_api.py::TestMergeSplitAndRulingOverHttp) — merge preserves all data and reports work, split prevents self-merge and validates ownership, split moves only named rows, ruling on uncontested season refused, season locks prevent all three write paths (UTR changes, membership changes, ruling), all key scenarios covered"
    - "code: Merge/split logic is pure function (command.py lines 53-203) separate from database operations; season lock check centralized in _assert_season_open() (line 55, all 11 callsites use this function) with message naming season (line 62); taking larger value explicitly commented (lines 334-337) with asymmetric reasoning 'participation UTR is read as an upper bound'; API responses communicate what happened via MergeReport dataclass; no indication that smaller is 'more conservative'"
    - "code-review: No CRITICAL/HIGH issues found; merge correctly handles identity key normalization from previous groups; split validation rejects foreign rows; ruling source correctly updated to admin_ruling; season lock message format consistent across all enforcement points"
  fix_tasks: []

# 2026-08-29: group 5 的 PASS 之后追加的修复。
# 评审内部的 code-review 子代理返回了一条 HIGH，但评审本身仍打了 100 —— 也就是说
# 那条发现没有进入评分。它是真的：merge 的赛季锁按「两人历史上碰过的所有赛季」取并集，
# 于是「幸存者在已锁的 2025 打过、重复记录只存在于 2026」这种情况会被拒，而这正是本
# 功能的主要用例（老赛季关掉之后才发现重复）。已按 TDD 补两条测试再改成只锁「被合并方
# 有行的赛季」。同批修掉：MergeIn.merge_id 的注释把存活方写反了（不可撤销操作上的反向
# 文档），以及裁决响应里 alt_value 写死成 None 而不是读 row。

- group: 6
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "spec: All 6 SHALL requirements met — httpOnly session cookie on login (test asserts httpOnly=true), secrets never in browser (admin.ts server-only module verified), password hashed (ADMIN_PASSWORD_HASH), session expiry enforced (readSession checks expiresAt), failed attempts display remaining count and unlock time (LoginForm.Message), unlogged writes return '需要登录' (NotLoggedIn class)"
    - "runtime: 34/34 tests pass across 3 files — session.test.ts covers rate limiting (per-address + global ceiling preventing rotation), admin.test.ts covers session validation and secret validation (throws if empty), login/page.test.tsx covers form rendering, cookie setting, attempt counting"
    - "code-review: No CRITICAL/HIGH issues. Both previously-flagged defects correctly fixed: (a) HIGH — rate limit now uses x-real-ip/x-vercel-forwarded-for (trusted) or last hop of x-forwarded-for (not first/attacker-controlled), plus unbypassable global cap (LOGIN_ATTEMPTS_GLOBAL=20) with regression test 'caps what address rotation can buy'; (b) MEDIUM — BACKEND_SECRET now throws if unset instead of sending empty string, with test 'refuses to write when BACKEND_SECRET is missing'"
    - "code: MEDIUM — unused searchParams parameter on LoginForm page.tsx (dead code suggesting abandoned URL-based error path in favor of useActionState; not a security risk but indicates incomplete cleanup)"
  fix_tasks: []

- group: 7
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 95}
  total: 97
  status: PASS
  findings:
    - "spec: All 12 SHALL requirements verified — list shows name/gender/current S&D UTR/status/seasonal UTR/all teams/link status (PlayerTable full columns), multi-team player lists all (test:839-849 finds both THU-UOC and THU-I in same row), 未裁决 & 预填 same warning style (both UNCONFIRMED, test:863 checks className parity), missing link visible not error (QUIET style not danger, test:875 checks !toMatch(/danger/)), detail page three blocks one screen (basic info/seasonal UTR/memberships all present with aria-labels, test:378-389), borrowed vs wildcard explained and system not-checking documented (lines 720-725, test:428-438), unresolved shows both candidates and larger-value rule (banner + table row shows {value} / {alt_value}, test:391-413 checks both + 较大), Appeal beside status not replacing (separate spans, test:415-426 finds both 已认证 AND Appeal), list scroll inside header outside (overflow-y-auto div wraps table only, header outside at flex-none position, matches h-screen overflow-hidden pattern with code comment explaining), unresolved count from server not page (two calls: getPlayers for rows + getPlayersPage(limit:1, unresolved:true) for count, X-Total-Count header in backend, test:912-928 verifies badge shows 17 not page size), edits not visible on public pages warned (message on detail page 568-574, test:440-449), all data via api.ts single outlet (getPlayers/getPlayer/getPlayersPage all use backendUrl+backendRequestInit)"
    - "runtime: All 24/24 tests pass across 3 files (page.test.tsx:24 tests, [id]/page.test.tsx:7 tests, lib/players.test.ts:177 tests) — covers one player multiple teams, unresolved vs prefilled styling, missing UTR link not error, unresolved queue link, search box persistence, empty state messaging, unresolved count from server not page, truncation detection, 404 handling, detail page three regions visible, unresolved banner text includes both values + 较大, both candidates shown in table, Appeal with status, borrowed vs wildcard explanation, edit warning message"
    - "code-review: APPROVE — no CRITICAL/HIGH issues. Verified: (1) truncation honesty — count_players() runs separate limit-agnostic count, X-Total-Count header set from it, frontend makes two calls (getPlayers + getPlayersPage limit:1) so badge never counts visible rows; (2) 未裁决/预填 styling — both use same UNCONFIRMED class, missing link uses QUIET not error colors; (3) both candidates + Appeal placement — detail shows {value}/{alt_value} and Appeal as second badge beside status; (4) scroll container — header flex-none outside, table in flex-1 overflow-y-auto div; (5) read-path-not-switched warning — present on detail page; (6) all team memberships — maps all not just first. One LOW note (not a defect): 未裁决 badge links to unbuilt group-8 route, expected per phased plan, could use disabled state until group 8 ships but does not block this change. No console.log, no secrets, all files <800 lines, no mutation issues."
    - "code: Clean architecture with types in api.ts (Player, PlayerSeasonUtr, PlayerMembership interfaces), components reusable (PlayerTable, Section, Field helpers), type-safe throughout, scroll pattern correct (nested not page-level), error boundaries handle all empty states gracefully, accessibility solid (semantic HTML + aria-labels on all sections), styling consistent (reusable UNCONFIRMED/QUIET/SETTLED/TAG/WARN/OK constants), well-commented design decisions (multi-team iteration, candidates for ruling, Appeal placement), backend query optimization with _filtered helper avoids duplication. Minor observation: the unbuilt unresolved-queue link is expected per plan, could be disabled+label vs live 404 per group 8 convention."
  fix_tasks: []

- group: 8
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 95}
  total: 99
  status: PASS
  findings:
    - "spec: Attempt 1 HIGH fixed — added value_division/alt_value_division to PlayerSeasonUtr model to track provenance. All SHALLs verified: (1) Merge/split pages present results before execution with danger-tier warnings distinct from warning-tier (test:336-344, 1003-1014), (2) Unresolved queue shows both candidates with their recorded origins, not inferred from size (test:1318-1333 'labels each candidate by where it came from, not by which is bigger'), (3) Allows third values via custom input (line 141-150 in page.tsx), (4) Bulk operation not primary (test:1413 verifies no bg-primary), (5) Split shows UTR links as evidence (test:1039), (6) Sidebar has 队员管理 link that redirects to /login when unsigned (layout.tsx players/), (7) Sidebar shows login status and logout (Sidebar.tsx lines 191-204)"
    - "runtime: Frontend 7 files 66 tests PASS (all merge/split/queue/list scenarios), backend 355 tests PASS. Critical fixes verified: 'labels each candidate by where it came from, not by which is bigger' PASS; 'says a candidate's origin is unknown rather than guessing one' PASS (test:1335-1351 for merged hand-made records with both divisions null)"
    - "code: No CRITICAL/HIGH issues. Division fields properly threaded: model → migration → query → API → frontend. Nullable types (Optional[str] = None) correct for backward compat. merge_rules.py lines 128/141-142 correctly extract and assign division_code for each candidate. Frontend page.tsx lines 63-74 place candidates by their recorded origin with correct 来源未知 fallback when unknown (merged records). Sidebar properly reads isSignedIn() server-side and passes through layout. Layout players/layout.tsx correctly redirects unsigned users to /login before rendering any admin page. Type safety maintained throughout; no mutations."
    - "code-minor: None — this is the exact fix attempt 1 required"
  fix_tasks: []
