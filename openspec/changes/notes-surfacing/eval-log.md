# Eval Log — notes-surfacing

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## group-1 / attempt-1
- date: 2026-09-07
- spec_score: 100
- runtime_score: 100
- code_score: 95
- total: 99
- status: PASS
- threshold: 80
- findings: |
  No CRITICAL/HIGH issues. Route ordering correct (before /{player_id}), SQL parameterized (no injection), auth via middleware (no admin needed), tests all pass (5 new batch tests + 5 existing). Minor: return type dict[int, list[dict]] could be dict[int, list[NoteOut]] for full type safety; FastAPI serializes correctly either way.

## group-2 / attempt-1
- date: 2026-09-07
- spec_score: 95
- runtime_score: 100
- code_score: 95
- total: 97
- status: PASS
- threshold: 80
- findings: |
  No CRITICAL/HIGH issues. Frontend API getPlayerNotesBatch: empty array → {} (no request), non-ok/exception → {} (proper degradation matching getPlayerNotes/getTeamPresets). Backend endpoint: declared before /{player_id} (comment explains route capture), SQL parameterized (no injection), _parse_ids handles de-duplication/clamping to 200, only includes ids with notes (no empty keys). player_id derivation from key: KEY_PREFIX="p" is module constant, slicing safe with test validation (key always f"p{id}"). Tests comprehensive: 21 frontend passed (4 new batch tests + 17 existing), 34 backend passed (new TestSeatPlayerId validates player_id on all seats), tsc clean (all ~15 lineup fixture files updated with player_id field). Minor: frontend doesn't validate batch size ceiling, but spec says backend should clamp (it does at 200).

## group-3 / attempt-1
- date: 2026-09-07
- spec_score: 95
- runtime_score: 100
- code_score: 92
- total: 96
- status: PASS
- threshold: 70
- findings: |
  No CRITICAL/HIGH issues. Shared constants extracted to notesDisplay.ts (CATEGORY_LABEL, CATEGORY_ORDER, TAG_CLASS, formatWhen) prevent drift across detail-page + 3 surfacing surfaces. NotesPopover: "use client" marked, proper RSC boundary. Read-only enforced—no append/delete controls, only display. Desktop hover+click + mobile click via onMouseEnter/Leave + onClick; Escape + click-outside close via useEffect listeners; max-h-60 + overflow-auto constrains height in h-screen shell. PlayerNotesBadges: empty → null (no placeholder), shows one pill per present category + count, wraps in NotesPopover. LineBlock seat: optional notes?: PlayerNote[]; checks length before rendering; weakness → text-danger (warning family), else text-muted (neutral); marker is <button> for accessibility; integrated into existing 外/▲/估 family with ml-0.5. All TAG_CLASS entries have explicit background colors (not relying on inheritance). Tests comprehensive: 4 files, 20 tests all pass (marker presence, warning tint, click opens, read-only verified, badge counts, empty state). tsc clean. Minor: empty afterEach() in 2 test files (harmless). Minor: LineBlock test regex `/text-(danger|warning)/` slightly loose but sufficient.

## group-4 / attempt-1
- date: 2026-09-07
- spec_score: 95
- runtime_score: 100
- code_score: 95
- total: 97
- status: PASS
- threshold: 80
- findings: |
  No CRITICAL/HIGH issues. Confidentiality gate implemented at fetch level on all three surfaces: lineup/compare/roster pages each check canEdit before calling getPlayerNotesBatch, pass {} to components when locked. Backend batch endpoint (/api/players/notes): declared before /{player_id} to prevent route capture, groups by player_id, returns only ids with notes, _parse_ids de-dupes/clamps to 200 (matching design decision). Frontend getPlayerNotesBatch: empty ids → {}, non-ok/exception → {} (proper degradation). Three-page integration seamless: LineupResults + SavedLineups thread notesByPlayer to CandidateCards + LineBlock; Compare fetches both sides' rosters + renders PlayerNotesBadges inline; Roster page fetches + passes to RosterTable (both mobile + desktop rows). All components handle notesByPlayer as plain Record<number, PlayerNote[]> — no RSC boundary violations. Tests: 14 pass (3 files, canEdit gating + no-fetch verified). tsc clean. Minor: Compare page Pair component layout restructured from inline text to flex-wrap (necessary to accommodate inline badges; layout change justified and well-executed). Minor: Separator moved from " · " text node to <span> element (style fix, no semantic change).
