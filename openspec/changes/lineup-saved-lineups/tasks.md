## 1. 后端：saved_lineups 存储 + CRUD + 服务端重判

### Contract
- **Spec**: 系统 SHALL 按 (赛季,组别,队) 存命名阵容 + 线位分配 + 参赛 UTR 快照；快照 MUST NOT 回写参赛 UTR、MUST NOT 影响引擎取数；同队名唯一、同名覆盖。存/删/存回 SHALL 是写操作、MUST 由方法判权 admin 中间件保护，列出+重判 SHALL 只读开放。列出时 SHALL 对每套用**当前** UTR 跑 `check_lineup` 给四态（仍合法 / UTR 动了仍合法 / 已非法带 violations / 有人离队），并给逐人快照 vs 当前差异；有人离队 MUST NOT 判为合法。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_saved_lineups.py tests/test_admin_auth.py` （本机 uv 被拦用系统 venv；CI 用 `uv run pytest`）→ expected: 存/取/删/同名覆盖、快照不回写、重判四态、无凭据写被拒 全通过
- **Code**: D1 单表 `zijing_cup.saved_lineups`（`assignment` + `utr_snapshot` 两列 JSONB、`unique(team_id,name)`、时间戳 server_default、FK cascade）；同名 upsert。D2 重判在列表 GET 逐套：`load_roster` 当前 key→Candidate 解析 assignment，任一 key 缺→`player_gone` 不跑 check；否则组 lineup 跑 `check_lineup`，`is_legal` + 快照 diff 分「仍合法/动了仍合法」、否则 `illegal`+violations。D5 存/删/存回 POST/DELETE/PUT 自动受保护，name≤60、每队≤50。远程迁移走 Dashboard，本地打本地栈（断言 127.0.0.1）。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/lineup-saved-lineups/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — pytest：迁移打本地栈后，存一套阵容（assignment + utr_snapshot），断言按队列出、内容一致
- [ ] 1.2 GREEN — migration `saved_lineups`（打本地栈）；`app/lineups/saved.py` 模型 + 存命令 + 列出查询
- [ ] 1.3 RED — pytest：同名再存断言覆盖；空名/超长名/超每队上限被拒
- [ ] 1.4 GREEN — 存命令 upsert 覆盖 + 名/数量守卫
- [ ] 1.5 RED — pytest：删一套断言没了；存回（PUT）覆盖 assignment + 重拍快照
- [ ] 1.6 GREEN — 删命令 + 存回命令（覆盖 + 快照更新）
- [ ] 1.7 RED — pytest：重判——(a) 快照==当前且合法→「仍合法」；(b) 改某人当前 match_utr 但仍合法→「UTR 动了仍合法」+ 点名 diff；(c) 改到超 cap→「已非法」+ violations 指 D1；(d) 某 key 不在名单→「有人离队」不判合法
- [ ] 1.8 GREEN — 重判逻辑：`load_roster` 解析、缺 key→player_gone、`check_lineup` 打当前值、快照 diff、四态 + utr_diff 出到响应
- [ ] 1.9 RED — pytest：快照留存**不回写**——存一套后读该队员当前 match_utr，断言未被改动
- [ ] 1.10 GREEN — 确认快照只写进 saved_lineups 列、不触碰 player_season_utrs（既有取数不变）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 后端：校验 assignment 端点（复用 check_lineup）

### Contract
- **Spec**: 校验端点 SHALL 接收一套 5 线 × 2 key 的 assignment，用**当前**参赛 UTR 解析后跑既有 `check_lineup` 回 violations（结构化、复用 `Violation` 中文 message），MUST NOT 复制合法性逻辑。引用 key 走与手填 URL 完全相同校验（未知→4xx、旧格式→stale-link）；重复上场等冲突由 `check_lineup` 据实报、MUST NOT 预拦。端点是 POST（body=assignment），被方法判权自动要求 admin。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_saved_lineups.py -k validate` → expected: 合法 assignment 回空 violations、各类非法（超cap/buffer/差距/重复/资格）回对应 violations、未知/旧 key 4xx、无凭据被拒
- **Code**: D3 `POST /.../teams/{team}/saved-lineups/validate`，body `{assignment:{线:[a,b]}}`；`load_roster` 当前值解析（`_reject_old_keys`），组 lineup 跑 `check_lineup`，回 `{violations:[{code,line,amount,message}]}`。不新增合法性代码。POST 自动 admin-gated（编辑是 admin 动作）。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-saved-lineups/contracts/group-2.md
- [ ] 2.1 RED — pytest：POST 一套合法 assignment（admin 凭据）断言 violations 空；POST 一套超 cap 的断言有 line_cap violation
- [ ] 2.2 GREEN — 校验路由 + `saved.py` 的 validate（load_roster 解析 + check_lineup + 序列化 violations）
- [ ] 2.3 RED — pytest：各类非法各回对应 violation（超 buffer / 超差距 / 重复上场 / 资格）；未知 key 4xx；旧格式 key → stale-link detail
- [ ] 2.4 GREEN — 补齐解析/校验分支（复用既有 `_reject_old_keys` 与 UnknownReference→422）
- [ ] 2.5 RED — pytest：校验端点是写方法（POST），无 admin 凭据被拒（沿用 test_admin_auth 全应用断言）
- [ ] 2.6 GREEN — 确认路由方法为 POST、自动受保护（无需额外声明）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 3. 前端：保存入口 + 已存阵容页（四态 + UTR-diff + 载入 + 删除）

### Contract
- **Spec**: 结果区每套候选 SHALL 对管理员提供「保存此阵容」（起名、队内唯一、同名覆盖），非管理员不见。已存阵容页 SHALL 列出该队所有已存阵容、按后端重判呈现四态（仍合法 / UTR 动了仍合法 / 已非法点名卡哪条 / 有人离队）并逐人点名快照 vs 当前 UTR 差异，MUST NOT 拿旧快照当合法性依据。已存阵容 SHALL 可一键载入（五线硬锁写进排阵 URL，坏 key 走 stale-link，不发带坏 key 搜索）。面板对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: 保存入口门控 / 四态渲染 / UTR-diff 点名 / 载入编码 / 既有 lineup 测试无回归
- **Code**: `lib/api.ts` 加类型 + 列出/重判 fetch（失败降级空列表，不拖垮）；`lib/admin.ts` 存/删 action。候选行保存入口（`LineupResults`/`CandidateTable`/`CandidateRow`，admin 门控只是表层）。新路由 `lineup/[code]/saved/`（`page.tsx` + `error.tsx`），四态用设计 token 着色（success/中性/danger/warning，不硬编码 hex），状态来自后端重判、diff 来自 utr_diff。载入 = assignment→五线 `lock=` 写 URL（复用 B/pin 载入），坏 key 走 stale。前端不做数值比较。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/lineup-saved-lineups/contracts/group-3.md
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-09-03-lineup-saved-lineups-mocks.html（① 保存入口、② 四态列表）；note tokens（success `#4c8a63`/`#eef4f0`、中性 `#706a61`/`#f2efe9`、danger `#b3261e`/`#fbf0ee`、warning `#8a6508`/`#fbf5e6`）与逐字串（「保存此阵容」「仍合法」「UTR 动了」「已非法」「有人离队」）
- [ ] 3.2 RED — vitest：候选行 admin 见「保存此阵容」、非 admin 不见
- [ ] 3.3 RED — vitest：已存阵容页对四态各渲染对应徽标 + 点名（UTR 动了点名 X→Y、已非法点名卡哪条、离队点名缺谁）；断言合法性来自后端 status 不来自快照
- [ ] 3.4 RED — vitest：载入把 assignment 编码成五线 `lock=`；含坏 key 走 stale 分支不发搜索
- [ ] 3.5 GREEN — `lib/api.ts`/`lib/admin.ts`；保存入口；`saved/` 页四态 + diff + 载入 + 删除；token 化；error.tsx
- [ ] 3.6 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`); admin 登录造已存阵容（含一套改 UTR 变非法、一套离队）导航到 `saved/` 页; 桌面 + 375 对照 mock; 量 computed style 对比度 ≥4.5、无横向溢出、44px; fix drift
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 4. 前端：就地编辑器（互换/替换 + 实时合法性 + 存回）

### Contract
- **Spec**: 已存阵容页 SHALL 允许管理员就地编辑一套阵容——线间互换两人、从名单替换一人。每次编辑后 SHALL 用当前 UTR 经后端校验端点实时重判并就近呈现（合法 / 卡哪条）。编辑 SHALL 自由改、合法性是唯一护栏（重复上场等 violation 当场报），MUST NOT 预拦、MUST NOT 自动修。存回 SHALL 覆盖原阵容并重拍 UTR 快照。编辑器对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: 互换/替换改变 assignment、实时校验触发（防抖）、live 结果渲染合法/卡哪条、存回 action、既有测试无回归
- **Code**: D4 编辑器：五线十槽、替换=每槽下拉（整队名单）、互换=选两槽高亮点「互换」对调。改动后调 `POST validate`（`lib/api.ts` 或 `lib/admin.ts`，因 POST 需 admin 走 admin 出口），客户端**防抖 ~300ms** + 「校验中」态，live 合法/卡哪条就近呈现（复用 `Violation` message）。存回 = PUT 覆盖 + 重拍快照（server action）。重复上场靠 check_lineup 报、不前端预拦。用设计 token。前端不做数值比较。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/lineup-saved-lineups/contracts/group-4.md
- [ ] 4.1 MOCK — open docs/superpowers/specs/mocks/2026-09-03-lineup-saved-lineups-mocks.html（③ 编辑器）；note 选中槽 primary 描边 `#9c3417`、live-ok success 档、live-bad danger 档，逐字串（「互换选中的两人」「实时」「存回」）
- [ ] 4.2 RED — vitest：编辑器互换两个槽 → assignment 两槽对调；替换一个槽 → 该槽换成所选人（纯 helper 或组件状态）
- [ ] 4.3 RED — vitest：改动后触发校验请求（mock fetch/action），live 区渲染返回的 violations（卡哪条）或「合法」；防抖只发一次
- [ ] 4.4 GREEN — 编辑器组件（互换/替换/选中态）；防抖校验调用；live 结果渲染；存回 action；token 化
- [ ] 4.5 VISUAL DIFF — bring up dev stack; 在 `saved/` 页编辑一套失效阵容（互换修好）; 桌面 + 375 对照 mock; 量对比度 ≥4.5、无横向溢出、44px; fix drift
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 5. 验证与交付

- [ ] 5.1 Run backend test suite — `cd backend && uv run pytest`（本机用 `backend/.venv-std/Scripts/python.exe -m pytest`）确保无回归
- [ ] 5.2 Run frontend test suite — `cd frontend && npm run test` 确保无回归
- [ ] 5.3 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [ ] 5.4 Run superpowers:verification-before-completion — 跑 test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config 的 custom_verification_checks；补种前不再跑 pytest（先测试→补种→视觉核对）；远程迁移记得去 Dashboard 手动执行
