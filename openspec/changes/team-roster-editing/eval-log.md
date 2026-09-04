# Eval Log — team-roster-editing

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 75}
  total: 94
  status: PASS
  findings:
    - "[HIGH] load_rules._field_differences() doesn't inspect borrowed_limits field changes — affects incremental edits to existing divisions' borrowed_limits won't persist on reload"
  notes:
    - "Migration, model schema qualification, seed values, and fresh seeding all correct per contract"
    - "89/89 tests pass including 3 new borrowed_limits tests"
    - "HIGH issue: drift-detection gap doesn't affect fresh seed (group-1 deliverable) but needs fixing for future season updates"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "[MEDIUM] school_count lacks bounds validation — accepts any int including negative/zero, should validate >= 1"
  notes:
    - "All 7 contract SHALLs verified: membership PATCH endpoint isolated from 5-field UTR, method-keyed admin auth, server-side representing_school clearing when borrowed/wildcard true, batch doubles overwrite respects season lock, school_count writable, Decimal full-stack, 403 on missing admin, no hardcoded secrets"
    - "112 tests pass (507 total) including 7 new test_team_editing.py tests covering membership flags, school_count, and batch doubles with locked/unlocked season logic"
    - "0 CRITICAL/HIGH issues; membership write properly isolated from UTR endpoint; auth middleware confirmed protecting both new PATCH routes"
    - "LOW notes: redundant team lookup in patch_team (already fetches before calling set_team_school_count), no season-lock guard on membership writes (intentional as metadata not competitive data)"
