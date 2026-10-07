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
- group: 2
  attempt: 1
  scores: {spec: 95, runtime: 100, code: 92}
  total: 96
  status: PASS
  findings:
    - "spec: All contract SHALLs met — history list + team filter + detail expand (MatchHistory.tsx), sidebar entry with nav integration (nav.ts, ActiveSidebar.tsx), prefill from saved lineups (MatchEntryForm.tsx line 246), canEdit gate with in-place locked state for non-admin (page.tsx), degrade to [] / null on failure (lib/api.ts), 未记录 for unmatched opponent (playerName line 621). Each route has error.tsx. Server actions try/catch only reset on success."
    - "runtime: vitest 84 tests PASS across 6 files (MatchEntryForm.test.tsx, MatchHistory.test.tsx, actions.test.ts, api.test.ts, nav.test.ts, Sidebar.test.tsx). tsc --noEmit CLEAN. Comprehensive coverage: form prefill, live outcome, team filtering, detail expand, 未记录 rendering, canEdit visibility, sidebar links, admin marking, API degrade paths, revalidate scope."
    - "code: Form UX solid — playerName() handles null → 未记录, PlayerSelect allowBlank param distinguishes our/opp, prefill clears sourceId when ourTeam changes, state management clean. API reads degrade gracefully (try/catch + return defaults). Write actions scope-checked via adminWrite, revalidatePath uses layout scope (both paths refresh). Rosters/saved lineups prefetch with ?? [] / ?? fallback. No secrets, no console.log, cohesive file organization."
- group: 3
  attempt: 1
  scores: null
  total: null
  status: BLOCK
  findings:
    - "HIGH: Spec violation — contract requires displaying '我方用的阵容名' (our lineup name used in each match), but component omits it. Spec: '列出我方对该对手队已录过的比赛（各场日期、我方用的阵容名、轮次、整场胜负）' (date, lineup name, round, result). Component only shows: date, round, result. Code comment acknowledges: 'Match records don't store a lineup name (only nullable source_lineup_id)'."
    - "MEDIUM: Win calculation uses '>=' so ties (our == opponent) count as wins. Unclear if ties are possible in scoring_mode 'match_count'; if yes, this inflates win count."
    - "MEDIUM: Test coverage insufficient — only 2 tests. Missing: (1) null round_label edge case (handled in code but untested), (2) single-match tally '1胜0负', (3) opponent code variants. Regression risk without test expansion."
    - "MEDIUM: Color accessibility not explicitly audited — text-success/text-danger at 13px bold on bg-surface/bg-surface-muted. Tokens defined in design system (used elsewhere), but no explicit contrast verify for this context."
  design_intent_note: "Design explicitly acknowledges match records store no lineup_name field (only source_lineup_id). Component intentionally omits lineup label per design decision D3 (stored references, no snapshots). However, this deviates from spec requirement which explicitly lists '我方用的阵容名' as a SHALL. Reconciliation needed: update spec to remove lineup_name requirement (design intent), or extend MatchRecord to store/display lineup name (spec compliance)."
- group: 3
  attempt: 2
  scores: {spec: 100, runtime: 100, code: 85}
  total: 95
  status: PASS
  findings:
    - "spec: Lineup name requirement (previous BLOCK) now satisfied by read-time resolution from lineupNames map (page.tsx lines 213-216; component lines 121-134). Design D3 honored: store reference, resolve on read, degrade gracefully. Ad-hoc matches (no source) and deleted lineups show no name — intentional. All spec items: region visibility when opponent selected (b != null); date/round/outcome display; win/loss/tie logic (strict > for win, < for loss, == tie); tally shown '胜/负'; ties displayed as '平' not in tally; canEdit gate; empty state; degradation on missing table."
    - "runtime: vitest 9 test files 40 tests all PASS; tsc --noEmit EXIT 0."
    - "code: CompareHistory.tsx clean (~90 lines), proper TypeScript. Win logic correct (strict > comparison). Lineup resolution correct (lineupNames[id] → undefined → fallback to team code). Filtering preserves canEdit context. lineupNames built from already-loaded data (no new fetches, efficient). Minor: test suite incomplete — does not explicitly verify team code fallback when source_lineup_id is undefined/not in map (implementation code is correct, but regression coverage gap)."
```
