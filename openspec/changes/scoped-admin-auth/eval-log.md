# Eval Log — scoped-admin-auth

<!-- Appended by evaluator subagent after each N.E EVAL run -->

- group: 1
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 92}
  total: 98.4
  status: PASS
  findings:
    - "Spec: All contract requirements met (table schema, unique constraint, GET 404, PUT upsert, backend never hashes, migration search_path, auth via middleware, no FK)"
    - "Runtime: 19/19 tests pass (schema validation, unique constraint enforcement, GET/PUT/auth endpoints, 404 behavior, upsert idempotency)"
    - "Code (92/100): No CRITICAL/HIGH issues. Two LOW findings (optional follow-ups): (1) Race on concurrent PUT without ON CONFLICT (low-likelihood admin operation), (2) Minor: response echoes payload.password_hash instead of row.password_hash post-commit (defensive improvement)"

- group: 2
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 96}
  total: 99.2
  status: PASS
  findings:
    - "Spec (100/100): D1 scope in HMAC payload ✓ ('*'/'season:division'), tamper→invalid signature ✓, readSession validates scope presence ✓. D2 three-branch super→'*'/competition→'season:division'/fail→null ✓, super-first precedence ✓, no-context→super-only ✓. D3 checkCompetitionPassword via backend GET+X-Backend-Secret ✓, fail-closed on 404/network/missing-config ✓, shared matches() ✓"
    - "Runtime (100/100): 30/30 tests PASS, tsc CLEAN. Scope round-trip ✓, tamper invalidates ✓, 3-branch resolveScope ✓, no-password→super-only ✓, hash-404→false ✓, hash-error→false ✓, no-context→super-only ✓"
    - "Code (96/100): No CRITICAL/HIGH issues (BLOCK-free). Four critical security checks all PASS: (1) scope forgery impossible (HMAC signed), (2) backend-read failures return false only (fail-closed), (3) super/competition precedence correct, (4) timing-safe compare intact. Two LOW findings (cosmetic, non-blocking): (a) stray JSDoc comment duplication on matches(), (b) season not URL-encoded (defense-in-depth; backend int-validates anyway)"

- group: 3
  attempt: 1
  scores: {spec: 100, runtime: 100, code: 90}
  total: 98
  status: PASS
  findings:
    - "Spec (100/100): canEdit(season,division) correctly gated to scope='*' OR 'season:division' (lib/admin.ts:46). NotAuthorizedForCompetition error class present (23-28). adminWrite scope param with default 'super-only' (line 85, fail-closed). assertScope pre-network check (61-70) runs before fetch (line 107). All 19 write server actions pass bound (season,division): lineup(savePreset,deletePreset,saveLineup,saveBackLineup,validateAssignment,deleteSavedLineup,reorderSavedLineups,cloneSavedLineup,renameSavedLineup); teams(saveCurrentUtr,saveTeamEdits); utr(previewSheet,applySheet); players(ruleOnSeason,mergePlayers,splitPlayer). Page-level gating: lineup page canEdit(36), players layout canEdit(22). EditModeToggle carries season/division hidden fields (113-114)"
    - "Runtime (100/100): 512 tests passed (62 files). lib/admin.test.ts: 12/12 passed. tsc clean. Flaky test (TeamEditPanel) passed. EditModeToggle hidden fields test included"
    - "Code (90/100): No CRITICAL/HIGH findings. Strengths: scope defaults to 'super-only' (fail-closed safety), assertScope pre-network, clear session→admin→enforcement chain, comprehensive test coverage, server actions properly bound. Minor: Could add one more end-to-end integration test showing scoped admin cross-competition rejection (unit tests comprehensive but single-call e2e would strengthen narrative)"
