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
