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
