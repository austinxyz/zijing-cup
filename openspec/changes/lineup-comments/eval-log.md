# Eval Log — lineup-comments

<!-- Appended by evaluator subagent after each N.E EVAL run -->

## Group 1 Evaluation

### Specification Compliance (100/100)
- ✓ Table schema: `lineup_comments` with `saved_lineup_id` FK→`saved_lineups(id)` cascade, `body` CHECK(1–2000), `created_at` server_default
- ✓ All endpoints present: GET list (desc), POST append, DELETE, batch GET with `/api/lineup-comments?ids=`
- ✓ Batch parsing: dedup, ignore-invalid, clamp≤200, return grouped map, omit empty ids
- ✓ Auth: GET needs X-Backend-Secret; POST/DELETE need X-Admin-Secret (method-based middleware)
- ✓ Validation: empty/whitespace → 422; >2000 → 422 (not 500)
- ✓ No update endpoint (append-only per spec)
- ✓ Cascade delete when lineup deleted (FK on delete cascade + test confirms)

### Runtime Test (100/100)
```
17 passed, 1 warning in 1.47s
```
- ✓ All tests pass (append/list/delete/batch/auth/validation/cascade/cross-lineup safety/route registration)
- ✓ Covers empty body, >2000 body, 401/403 auth, 404 cross-lineup, cascade delete, batch dedup, id clamping

### Code Quality (95/100)
**Code review findings:**
- ✓ No CRITICAL or HIGH issues
- 2 LOW (stylistic, non-blocking):
  - Batch/list/POST endpoints return plain `dict` instead of typed response model (minor inconsistency)
  - Lineup existence check in POST is nice-to-have defensive addition (not required)

**Correctness checks:**
- ✓ `created_at` uses `sa_column=Column(DateTime(tz), server_default=func.now(), nullable=False)` (avoids SQLModel NULL pitfall)
- ✓ Migration starts with `set search_path to zijing_cup, public;`
- ✓ Batch route declared before `/{id}` routes (avoided shadowing)
- ✓ `CommentIn.body` has `Field(min_length=1, max_length=2000)` + trim validator
- ✓ `_parse_ids` dedup/ignore-blank/ignore-non-int/clamp correctly
- ✓ DELETE checks `saved_lineup_id` match (cross-lineup safety)
- ✓ FK is `on delete cascade` (not restrict)

### Scores
```yaml
spec: 100
runtime: 100
code: 95
total: (100 × 0.4) + (100 × 0.4) + (95 × 0.2) = 99
```

### Status
**PASS** (99 ≥ 80 threshold)

## Group 2 Evaluation

### Specification Compliance (100/100)
- ✓ `lib/api.ts`: `LineupComment` type with `{id, body, created_at}` + `getLineupCommentsBatch(ids): Record<number, LineupComment[]>`
- ✓ Empty ids → `{}` (no request); non-ok/exception → `{}` (degradation)
- ✓ Server actions: `addLineupComment`/`deleteLineupComment` via `adminWrite` scope `{season,division}`
- ✓ `addLineupComment`: trims body, no-op on blank (never reaches backend)
- ✓ Both revalidate with `"layout"` scope on `/${season}/${division}/lineup/${team}` (covers /[team] and /[team]/saved)
- ✓ SavedLineups card: card-internal expandable `LineupComments` (not body-portal), local `useState` fold/expand
- ✓ Folded shows count; expanded shows timeline (body + time + delete) + append form
- ✓ Edit controls (append/delete) gate: `editable=showEdit` where `showEdit = canEdit && editing`
- ✓ View mode: read-only (no append form, no delete buttons)
- ✓ `page.tsx`/`saved/page.tsx`: batch-fetch only when `canEdit`; pass to `SavedLineups` as `commentsByLineup`
- ✓ Clone doesn't copy comments (backend-handled, no frontend changes needed)

### Runtime Test (100/100)
```
 Test Files  23 passed (23)
      Tests  180 passed (180)
```
- ✓ All unit tests pass: `LineupComments.test.tsx` (collapse/expand, view/edit modes, append/delete)
- ✓ Server actions tests pass: `commentActions.test.ts` (POST/DELETE paths, trim, revalidate scope)
- ✓ API batch tests pass: `lib/api.test.ts` (fetch, empty ids, degradation on non-ok, degradation on exception)
- ✓ Page component tests updated with mocks for new imports
- ✓ `tsc --noEmit`: 0 errors (type safety clean)

### Code Quality (85/100)
**Code review findings:**
- ✓ No CRITICAL or HIGH issues
- ✓ Type signatures correct: `Record<number, LineupComment[]>` mirrors `getPlayerNotesBatch` pattern
- ✓ Degradation paths all covered (empty, non-ok, exception)
- ✓ Component gate wiring: `editable=showEdit` passed correctly, `onAdd`/`onDelete` only when `editable`
- ✓ Reuse of `formatWhen` from `notesDisplay` (DRY, consistent timing format)
- ✓ Inline confirm before delete (safe, matches spec)
- ✓ Error messages clear and localized (评论保存失败、删除失败)

**Issues noted (non-blocking):**
- MEDIUM (85/100 deduction): No SavedLineups-level integration test for multi-card comment wiring (component tested in isolation, actions tested in isolation; the per-card callback binding via map + commentsByLineup lookup could have a cross-card mix-up or undefined issue, but UI pattern is simple and visual review would catch it; acceptable for this stage, but a two-lineup test asserting delete calls per-card callbacks with correct ids would close the gap)
- LOW: `revalidatePath(..., "layout")` on segment with no local `layout.tsx` will walk up to ancestor layout, revalidating slightly wider than docstring implies (still covers both target pages, functionally correct, scope just broader than expected)

### Scores
```yaml
spec: 100
runtime: 100
code: 85
total: (100 × 0.4) + (100 × 0.4) + (85 × 0.2) = 97
```

### Status
**PASS** (97 ≥ 70 threshold)
