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

## Group 2 — Attempt 1

- **group**: 2
- **attempt**: 1
- **scores**:
  - spec: 92
  - runtime: 100
  - code: 68
- **total**: 87.2 (insufficient due to HIGH issue)
- **status**: BLOCK — HIGH severity spec violation found during code review
- **findings**:
  - HIGH: Players with zero derivable match_utr are silently dropped from roster (backend/app/rosters/query.py:228–232). The code's own comment says dropping "would misreport the squad," yet it does so. This violates `team-roster/spec.md` requirement "MUST NOT 因为缺值就把这名队员从名单里略去" and the "缺值队员仍在名单里" scenario. Creates inconsistency: `list_teams` returns `player_count: N` but `get_team_roster` returns fewer than N players with no indication of the omission. Unfixed by test suite because fixture gives every player a resolvable value (either direct or from prior season). Per design.md, any registry player with no `player_season_utrs` row in any season and no current-doubles value will resolve to None and be dropped.
  - Blocker: Fixing cleanly requires either (1) relaxing `match_utr` to `Optional[Decimal]` (violates contract D5 constraint that this is the only type change) or (2) showing unresolvable players explicitly and letting frontend render (requires design review).
  - Spec: All other SHALL statements correctly implemented; data source switched to player registry (D7); response shape preserved (D5); rating_class from status, under_appeal separate (D6); sorting on resolved value
  - Runtime: All 23 tests pass; fixture correctly builds on new tables without roster_entries
  - Code: Data source fully switched, field types correct, query optimization sound; one CRITICAL logic gap (player omission on zero derivable value)
- **code_review_summary**: BLOCK — spec violation in roster omission logic. Other implementation (D5–D7, SQL queries, field mapping) is sound but cannot proceed without fixing player dropout.
