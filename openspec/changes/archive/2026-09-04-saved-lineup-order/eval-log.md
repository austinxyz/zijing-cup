# Eval Log — saved-lineup-order

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1: sort_order column + list/save logic

- group: 1
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 100
  total: 100
  status: PASS
  findings: []

## Group 2: reorder endpoint (whole-list validation & atomic write)

- group: 2
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 95
  total: 99
  status: PASS
  findings:
    - "spec: All 6 SHALL requirements met — whole-list validation, exact set match, atomic whole-or-nothing, idempotent, 422 on mismatch, method-gated auth"
    - "runtime: All 7 tests pass (reorder/order tests: idempotency, bad-list rejection with 3 scenarios, auth gating)"
    - "code: APPROVED by code-reviewer. 0 CRITICAL/HIGH, 0 MEDIUM, 1 LOW (Pydantic default value is inert). Validation correctly catches duplicates + foreign ids + missing ids before any writes. Atomicity enforced via single commit after all staged. Idempotency verified. Auth via PATCH method-gating. Test coverage comprehensive."

## Group 3: clone endpoint (byte-for-byte copy +副本N dedup + sort_order end)

- group: 3
  attempt: 2
  scores:
    spec: 100
    runtime: 100
    code: 100
  total: 100
  status: PASS
  findings:
    - "spec: All 5 SHALL requirements met — byte-for-byte copy (assignment/utr_snapshot), name format <原名> 副本 with deduplication, sort_order at end (max+1), 50-cap with 409 status, 404 for wrong team, method-gated auth. Prior BLOCK (name-length overflow) fixed via _unique_clone_name's fit(suffix) clamp to MAX_NAME_LENGTH (60). Verified by test_clone_of_a_near_max_name_stays_within_60_chars (58-char source)."
    - "runtime: All clone tests pass — 6/6 clone-specific (copy, dedup, cap, length, 404, auth), 3/3 sort_order, 3/3 reorder, 42/42 total. BACKEND_SECRET/ADMIN_SECRET pytest run clean."
    - "code: APPROVED by code-reviewer. 0 CRITICAL/HIGH/MEDIUM. 2 LOW (shallow-copy of nested assignment values — not exploitable today; pre-existing cap-check race — not a regression). fit(suffix) logic verified sound: room = MAX_NAME_LENGTH - len(suffix), base[:room] + suffix ensures exact 60-char cap. Exception handling correct (404, 409, 422 as spec). Atomicity + idempotency verified on reorder. Migration DDL flagged for manual Dashboard execution (shared Supabase project)."

## Group 4: frontend reorder (drag + ↑/↓) + clone

- group: 4
  attempt: 1
  scores:
    spec: 100
    runtime: 100
    code: 88
  total: 98
  status: PASS
  findings:
    - "spec: All 8 SHALL requirements met — sort_order field in SavedLineup type, HTML5 desktop drag, mobile ↑/↓ 44px (h-11 height), full ordered id list sent on reorder, no rebound (optimistic+revalidatePath), clone button per row, admin-only controls (canEdit gate), revalidatePath not router.refresh. Tests comprehensive (up/down/clone/non-admin, 14/14 pass). tsc --noEmit clean."
    - "runtime: vitest 14/14 pass (up-move [2,1,3], down-move [1,3,2], clone id, non-admin no controls). tsc --noEmit clean (no errors)."
    - "code: APPROVED by code-reviewer with caveats. 0 CRITICAL/HIGH. 1 MEDIUM (rapid-click race: useTransition isPending unused, buttons not disabled during pending reorder, concurrent PATCH calls can silently pick wrong final order on refetch). Fix: destructure isPending from useTransition and disable controls while pending, or serialize commits. 1 LOW (unused useRouter mock in test file — just cleanup). Pattern correct: SavedLineups maintains local state keyed on id-sequence, commitOrder saves-before/optimistic-update/rollback-on-catch, move() and drop() both send full id list, error shown in role=alert. Drag handlers (onDragStart/Over/Drop), clone button both correct. canEdit gates both actions. Verdict: PASS (race condition bounded by existing rollback path, not data loss)."
