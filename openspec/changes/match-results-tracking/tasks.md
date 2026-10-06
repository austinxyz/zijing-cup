# Tasks — match-results-tracking

## 1. 后端：比赛记录表 + CRUD + 整场算分

### Contract
- **Spec**:
  - 管理员（通过 `canEdit(season, division)`）SHALL 能录入一场已打完的比赛，含：日期（必填）、对手队（同一 (season, division) 的另一支队）、轮次（可选自由文本）、我方逐线上场球员、对手逐线上场球员、每线一个 win/loss 结果、每线一段可选自由文本备注。写 SHALL 经受保护写路由（`WRITE_METHODS` 中间件自动保护）并带 scope `{season, division}`。对手队 MUST 校验为同组另一支队，跨组或自己对自己 SHALL 拒绝。
  - 比赛的我方阵容 SHALL 存为该比赛自己的快照 `{line: [player keys]}`，而非外键引用某套已存阵容。比赛 SHALL 存一个可空 `source_lineup_id` 仅作溯源；该 `source_lineup_id` 指向的 saved_lineup 被删或改名后，比赛记录仍 SHALL 完整显示其阵容快照。
  - 对手逐线上场球员 SHALL 引用对手队当季名单里的 player。个别对不上的位置 SHALL 留空，读侧用「没有值」表示而非 0 或哨兵。
  - 每线 SHALL 存一个 win/loss 结果与一段可选备注。整场胜负 SHALL 由逐线结果按该 division 的 `scoring_mode` 自动计算（`match_count` 数赢线、`points` 按线位加权）；该整场值 SHALL 只读、从不接受手填，始终以逐线结果为准。
- **Runtime**: `cd backend && uv run pytest tests/matches/` → expected: 全部通过，无 import 错（本机按 CLAUDE.md 走 `backend/.venv-std/Scripts/python.exe -m pytest`）
- **Code**:
  - 单表 `zijing_cup.match_records` + JSONB `lines`（`{line:{our:[keys],opp:[pid|null],outcome,note}}`），写入侧 pydantic 逐线校验（outcome 枚举 / our 恰两 key / note 长度 / opp int|null），不裸塞 JSONB（design D1）。
  - 整场胜负纯推导、不落库列：读时按 `division_lines`+`scoring_mode` 算，部分录入只统计已录线（design D2）。
  - `source_lineup_id` 可空 int、无 FK（照 saved_comparison 范式，删 saved_lineup 不碰记录）（design D4）；`match_date` 存 DATE、用户录入、无 tz 风险（design D5）。
  - migration `set search_path` 打头、schema-qualified、composite FK `(season_year,division_code)`→divisions、对手≠我方校验；远程 Dashboard 手工执行（no-CLI-push）。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/match-results-tracking/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — write failing pytest: migration/model `MatchRecord` exists with `lines` JSONB, `source_lineup_id` nullable no-FK, `match_date` date, FK our/opponent team + composite division FK
- [x] 1.2 GREEN — write migration `supabase/migrations/<ts>_create_match_records.sql` + `app/models/match_record.py` (SQLModel mirror); apply to local stack (assert `127.0.0.1`)
- [x] 1.3 RED — write failing pytest for per-line write validation (pydantic: outcome in {win,loss}, our has exactly 2 keys, opp entries int|null, note length) + same-division opponent check (reject cross-division / self)
- [x] 1.4 GREEN — `app/matches/` create+validate; `app/routers/matches.py` POST create under `/api/seasons/{year}/divisions/{code}/matches` (protected by WRITE_METHODS middleware)
- [x] 1.5 RED — write failing pytest for whole-match outcome compute: silver `match_count` (3-2), gold `points` weighted; partial-recorded counts only recorded lines; computed read-only (no stored score column)
- [x] 1.6 GREEN — implement `compute_match_outcome(division_lines, lines, scoring_mode)`; wire into GET read
- [x] 1.7 RED — write failing pytest: list matches for (season,division) with team filter; detail returns both-side line players + outcome + note; deleted `source_lineup_id` target → snapshot still complete
- [x] 1.8 GREEN — `app/matches/` list/get + `app/routers/matches.py` GET list + GET detail (canEdit read); batch-resolve referenced players (our keys + opp ids) to avoid N+1
- [x] 1.F1 FIX — Validate opp player refs: len(opp)==2, ids must belong to opponent team roster in that season. Validate our player keys: len(our)==2, match pattern ^p\d+$, distinct within line, exist in our team roster (reject garbage/duplicate/invalid keys)
- [x] 1.F2 FIX — Add onupdate=func.now() to updated_at field in MatchRecord model (sa_column), so PUT/PATCH in future groups will update the timestamp; or formally document deferral to group 2 with explicit task
- [x] 1.F3 FIX — Add check (char_length(round_label) <= 60) to migration DDL, or move validation to pydantic BaseModel round_label field (ensure 60-char limit enforced on all write paths)
- [x] 1.F4 FIX [WONTFIX: 数据量极小(≤数十场/组)，Python 过滤无瓶颈；保留] — Move list filtering from Python to SQL: use `team_code`/`opponent_code` params to build WHERE clause (enables index use; unknown codes return empty list)
- [x] 1.F5 FIX [WONTFIX: cascade 是 design 决定——记录随 division/team 消亡；rosters 导入删队连带删史是既定代价] — Consider teams FK cascade: change ON DELETE CASCADE to ON DELETE RESTRICT to protect match history from silent deletion when rosters import re-runs (trade-off: explicit error vs historical preservation)
- [x] 1.F6 FIX [WONTFIX: 允许空 lines 支持增量/草稿录入；整场算分只统计已录线] — Reject empty lines dict (require at least one line per match); add test case
- [x] 1.F7 FIX — Add missing test cases: opp length validation, duplicate our keys, invalid our key format, round_label over 60 chars
- [x] 1.F8 FIX — Implement player resolution for GET list/detail (task 1.8 marked done but not implemented). Batch-load all our-side `p{id}` keys and opp ids; resolve via roster to player names + UTR. Return names in response (not raw IDs), avoiding N+1 queries. Per design D3 "references resolved at READ time".
- [x] 1.F9 FIX — Strengthen our-side key validation: add StrictInt or length checks on opp array (≤2 for doubles); reject duplicate keys within a line; add regex `^p\d+$` for our key format. Add test case: test_reject_duplicate_our_keys, test_reject_invalid_our_key_format, test_reject_opp_array_over_two.
- [x] 1.F10 FIX — Add test for cross-division opponent with real team in alternate division (not just nonexistent code). Add tests for gold `points` mode end-to-end (create match, list, verify score calculated correctly). Add DB constraint tests (insert row with our_team_id==opponent_team_id, expect IntegrityError; verify composite FK to divisions exists).
- [x] 1.F11 FIX — Tighten validation: cap source_lineup_id range `Field(ge=1, le=2**63-1)` to catch overflow; change _out() to fail if team code missing (raise KeyError or assertion instead of `codes.get(..., "")`); test round_label limit on schema (direct insert over 60 chars → check violation).
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：录入表单 + 比赛历史页 + 侧栏入口

### Contract
- **Spec**:
  - 系统 SHALL 提供一个比赛历史页，列出该 (season, division) 所有录过的比赛（我方队 / 对手 / 日期 / 轮次 / 整场结果），SHALL 支持按队筛选，并 SHALL 能点开一场看逐线详情（双方逐线球员 + 每线 win/loss + 备注）。该页 SHALL 从侧栏有入口。
  - 录入时系统 SHALL 支持「复制自某套已存阵容」预填再调整。
  - 录入入口、历史页 SHALL 按 `canEdit(season, division)` 门：免密队员 SHALL 看不到录入入口、历史页不可达。当比赛记录表在远程尚未建好时，所有读路径 SHALL 降级为「无历史」而非 500。
- **Runtime**: `cd frontend && npm run test` → expected: match-results 组件/页测试全绿（注意：vitest 不做类型检查，另须 `npx tsc --noEmit` 过——见 config custom_verification_checks）
- **Code**:
  - 读经 `lib/api.ts` 单一出口，`getMatchRecords` 等取数失败降级 `[]`（照 getSavedComparisons 范式，兜未建表远程）（design D6）；写经 `lib/admin.ts` `adminWrite` scope `{season,division}` + 成功 `revalidatePath(..., "layout")`。
  - 我方/对手球员只存引用，显示在读时经 roster `key→player`/`id→player` 解析；对不上显示「未记录」而非空白/0（design D3，spec「对不上留空」）。
  - 新路由 `app/[season]/[division]/matches/` 每条自带 `error.tsx`（冷启动取数失败不清侧栏）；录入表单的 server action try/catch、只成功时 reset。
  - 侧栏入口照 participation-utr-sampling 先例加（canEdit 可见）。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/match-results-tracking/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-10-03-match-results-tracking-mocks.html (录入表单①、历史列表③、移动④); note design tokens (project.design_system=linear → 项目自带 token) and verbatim strings（「录入比赛」「整场（自动）」「未记录」「复制自已存阵容」「比赛历史」）
- [ ] 2.2 RED — write failing vitest for `lib/api.ts` `getMatchRecords`/detail (degrade `[]`/null on non-ok) + match-results actions (create/prefill) trim + canEdit gate
- [ ] 2.3 GREEN — `lib/api.ts` reads + `app/[season]/[division]/matches/actions.ts` (adminWrite + revalidate layout)
- [ ] 2.4 RED — write failing vitest for 历史列表 (team filter, row shows date/opp/round/outcome, expand detail shows both-side players + win/loss + note, "未记录" for unresolved opp) + 录入表单 (prefill from saved lineup, win/loss toggle, auto outcome display)
- [ ] 2.5 GREEN — implement 历史列表页 + 逐线详情 + 录入表单 components + route (each route自带 error.tsx; gated by canEdit; 录入入口仅 canEdit)
- [ ] 2.6 GREEN — add Sidebar/nav entry「比赛历史」(canEdit visible; 照 participation-utr-sampling 先例) + update Sidebar/nav/TopNav tests together (一份 nav 数据多消费者)
- [ ] 2.7 VISUAL DIFF — bring up dev stack; navigate to `/{season}/{division}/matches` + 录入; eyeball against mock ①③④; fix token/color/text drift; 核对最长名单与矮窗口不裁
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：对手对比页「历史对局」区

### Contract
- **Spec**:
  - 在对手对比页（`/compare`），当已解锁管理员选中一支对手队后，系统 SHALL 显示一个「历史对局」区，列出我方对该对手队已录过的比赛（各场日期、我方用的阵容名、轮次、整场胜负），并 SHALL 汇总对该队的总战绩。该区 SHALL 仅对 `canEdit` 可见；未选对手或无记录时 SHALL 为空态（无内容而非报错）。读取失败时该区 SHALL 降级为空态、不拖垮对手对比页。
- **Runtime**: `cd frontend && npm run test` → expected: compare 页「历史对局」区测试全绿 + `npx tsc --noEmit` 过
- **Code**:
  - 「历史对局」是挂在核心页上的旁支只读：取数失败一律降级为空态，别让它的 500 变成对手对比的 500（CLAUDE.md「只读增强取数失败必须降级」）。
  - 取数在 canEdit 之后、server 端；非管理员不取不渲染（spec「仅 canEdit 可见」）。
  - 复用 group-1 的 `getMatchRecords`（按对手 code 过滤 + 整场结果）。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/match-results-tracking/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-10-03-match-results-tracking-mocks.html (对手对比历史区②); note 折叠块 tokens + verbatim strings（「历史对局」「X 胜 Y 负」「我方还没录过对这支队的比赛」）
- [ ] 3.2 RED — write failing vitest: compare page shows 历史对局 region when opponent selected with records (date/lineup name/round/outcome + 总战绩); empty state when no records; region absent/empty for non-canEdit; degrades to empty on fetch error
- [ ] 3.3 GREEN — add 历史对局 region to `compare/page.tsx` + component (server fetch behind canEdit, filter by opponent code, degrade `[]` on error)
- [ ] 3.4 VISUAL DIFF — bring up dev stack; navigate to `/{season}/{division}/compare` select opponent; eyeball against mock ②; fix drift; verify empty state + non-admin no region
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证 + 交付

- [ ] 4.1 Run backend test suite — `cd backend && uv run pytest`（本机 `.venv-std`）ensure no regressions
- [ ] 4.2 Run frontend test suite — `cd frontend && npm run test` + `npx tsc --noEmit` ensure no regressions（vitest 不做类型检查）
- [ ] 4.3 本地真机 e2e：补种后（顺序 测试→补种→视觉，中途不插 pytest）录 1-2 场（银/金各一，验整场算分）→ 历史页 + 对手对比历史区显示正确；免密看不到；缺表降级手验（BACKEND_URL 指空端口看侧栏还在）
- [ ] 4.4 Run superpowers:verification-before-completion (run project.test_commands; grep -r console.log frontend/src; run project.custom_verification_checks from openspec/config.yaml incl `npx tsc --noEmit`)
