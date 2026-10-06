# Eval Log — match-results-tracking

<!-- Appended by evaluator subagent after each N.E EVAL run -->

```yaml
- group: 1
  attempt: 1
  scores: null
  total: null
  status: BLOCK
  findings:
    - "HIGH: Player reference validation incomplete — opp list length not checked, our keys not validated against roster, no membership checks"
    - "HIGH: updated_at never updates — server_default set but no onupdate=func.now() for future edit paths"
    - "MEDIUM: Empty lines dict accepted (0-0 match), list filtering in Python vs SQL, round_label limit not in migration, cascade delete risks match history"
  fix_tasks:
    - "1.F1 FIX — Validate opp: len(opp)==2, check ids belong to opponent roster in that season; validate our: len(our)==2, match ^p\\d+$, distinct, in our team roster"
    - "1.F2 FIX — Add onupdate=func.now() to updated_at field in MatchRecord model, or document deferral to group 2 with explicit task"
    - "1.F3 FIX — Add check (char_length(round_label) <= 60) to migration, or move validation to pydantic BaseModel"
    - "1.F4 FIX — Consider: change teams FK to ON DELETE RESTRICT (not CASCADE) to protect match history from rosters imports"
    - "1.F5 FIX — Move list filtering to SQL WHERE clause (use team_code/opponent_code params directly in query)"
    - "1.F6 FIX — Require at least one line in match (reject empty lines dict)"
- group: 1
  attempt: 2
  scores: {spec: 70, runtime: 100, code: 55}
  total: 79
  status: RETRY
  findings:
    - "spec: task 1.8 marked complete without implementation (player resolution not in code; returns raw IDs instead of resolved names per design D3)"
    - "code: cross-division opponent validation tested only with nonexistent code, not real team in alternate division"
    - "code: multiple contract items untested (note length limit, opp int|null validation, gold points mode, round label limit, DB constraints including composite FK and opponent≠self)"
    - "code: our-side keys loosely validated (accepts duplicates, no regex/format check); opp array lacks length constraint (should be ≤2 for doubles)"
    - "code: source_lineup_id unbounded (should add Field ge=1 le=2**63-1); _out() falls back to empty string for missing team code (should fail-loud to expose data inconsistency)"
- group: 1
  attempt: 3
  scores: {spec: 100, runtime: 100, code: 98}
  total: 99
  status: PASS
  findings:
    - "spec: All 8 contract requirements implemented end-to-end. Player resolution now returns our_players/opp_players with full briefs (player_id, last_name, first_name, gender); unmatched opp slots degrade to null per design D3."
    - "runtime: 27/27 tests pass. Comprehensive coverage: roundtrip, create validation, outcome (both match_count & points), list/detail, line shape, player resolution, cross-division rejection, self-play rejection, note length, duplicate keys, opp count, round label overflow, gold scoring. No import errors."
    - "code: Backend routes fully protected by WRITE_METHODS middleware, scoped to (season, division). LineIn validators: outcome enum, our keys exact 2 + format p\\d+ + distinct, opp exact 2 + int|null, note ≤500, round_label ≤60. Batch-resolved players avoid N+1. Whole-tie outcome derived per scoring_mode, never stored (design D2). source_lineup_id nullable int, no FK (design D4). match_date DATE, no tz risk (design D5). Cascade delete intentional (design). Empty lines allowed (design). SQL injection prevented via SQLModel parametrization. Composite FK (season_year, division_code)→divisions with cascade. Self-play check in code + DB constraint. Migration set search_path, schema-qualified, composite FK, proper server_defaults. No hardcoded secrets, input sanitized at pydantic."
```
