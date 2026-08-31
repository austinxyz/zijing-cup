## 1. 参赛 UTR 推导链（纯函数）

### Contract
- **Spec**: 排阵取值时，一名队员该赛季的参赛 UTR SHALL 按以下顺序逐级回退，取到第一个有值的为准。标记 MUST 带上年份。这条链是组委会自己的算法，名单页与排阵引擎 SHALL 使用同一条链，对同一名队员给出同一个数字。搜索结果 SHALL 标出每个参与计算的数字是冻结值、估算值，还是取自未裁决冲突的较大值。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_chain.py -q` → expected: 全部通过，无 import 错误；测试不触碰数据库
- **Code**:
  - D1：链放在 `backend/app/players/utr_chain.py`，纯函数，签名不带 `Session`。写成 SQL 已被否决——第二步取决于 `current_doubles_status` 的字符串取值。
  - D2：`origin` 是枚举 `{frozen, current_doubles, prior_season}` 加 `origin_year`，中文文案在前端拼。后端 MUST NOT 返回拼好的中文串。
  - D3：`is_unresolved` 的行取 `value`（较大者），并把 `is_unresolved` 透传出去。
  - 第三步取**最近一个有值赛季**，不限于上一年。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — 新建 `backend/tests/test_utr_chain.py`，断言有该赛季 match UTR 时返回该值且 `origin == "frozen"`；此时 `app.players.utr_chain` 尚不存在，失败于 ImportError
- [x] 1.2 GREEN — 建 `backend/app/players/utr_chain.py`，实现 `ResolvedUtr` 与 `resolve_match_utr` 的第一步
- [x] 1.3 RED — 无该赛季值、当前双打状态为 `rated` 时返回当前双打值且 `origin == "current_doubles"`
- [x] 1.4 GREEN — 实现第二步
- [x] 1.5 RED — 无该赛季值、当前双打状态为 `projected` 时回看历史，返回**最近**有值赛季的 match UTR，`origin == "prior_season"` 且 `origin_year` 为那一年；再加一例 2026/2025 皆空、2024 有值，断言取到 2024
- [x] 1.6 GREEN — 实现第三步（按年降序取第一个有值的赛季）
- [x] 1.7 RED — 四步都取不到时返回 `None`；当前双打有值但状态为 `unrated` 时不走第二步而回看历史
- [x] 1.8 GREEN — 补齐状态判定与 `None` 分支
- [x] 1.9 RED — 命中的赛季 UTR 为 `is_unresolved` 时，返回较大的候选值且 `is_unresolved` 为 True
- [x] 1.10 GREEN — 透传 `is_unresolved`
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 球队列表与名单读取换源

### Contract
- **Spec**: 两个端点的数据来源 SHALL 是队员注册表（队员 / 赛季参赛 UTR / 队伍成员关系），MUST NOT 再读名单快照 `roster_entries`。名单的「人数」自此等于该队的成员关系条数，性别取自队员记录。响应的字段集合 SHALL 保持不变。`dutr_status` / `source_note` / `daily_utrs` 恒为 null。一名队员在该赛季没有参赛 UTR 时，端点 SHALL 返回按推导链取得的值及其来源标记，MUST NOT 因为缺值就把这名队员从名单里略去。性别为空的记录 MUST 单独计数。系统 MUST NOT 提供任何修改名单或球队的 HTTP 端点。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_roster_api.py -q` → expected: 全部通过；fixture 建在新表上，不再插入 `roster_entries`
- **Code**:
  - D5：`dutr_status` 当前是必填 `str`，要放宽成 `Optional[str]`。这是本次唯一的响应类型变更，且是放宽而非收紧。
  - D6：`rating_class` 由 `player_season_utrs.status` 直接映射（verified/committee/captain/null）；`under_appeal` 独立传出。
  - D7：`list_teams` 保持**一条**查询、保持外连接（无人的队仍出现且计数为零）、保持 `ORDER BY code`。改成 `Team LEFT JOIN PlayerTeamMembership JOIN Player`。
  - 名单排序照旧「参赛 UTR 降序，同值按姓」，且排序用推导后的值。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — 改写 `tests/test_roster_query.py` 的 fixture 建到新表（players / memberships / season utrs），断言球队列表的人数等于成员关系条数；此时 `list_teams` 仍读 `roster_entries`，人数为 0，失败
- [x] 2.2 GREEN — `list_teams` 换成 `Team LEFT JOIN PlayerTeamMembership JOIN Player`，保持单查询、外连接与 code 排序
- [x] 2.3 RED — 断言男/女/未填三档之和等于总数，且性别为空的队员单独成档
- [x] 2.4 GREEN — 性别分档取自 `Player.gender`
- [x] 2.5 RED — `get_team_roster` 返回该队全部成员，含参赛 UTR、`rating_class`、`under_appeal`、外援标记与来源；断言 `dutr_status`/`source_note`/`daily_utrs` 三者恒为 null
- [x] 2.6 GREEN — `get_team_roster` 换源；`RosterPlayerOut.dutr_status` 放宽为 `Optional[str]`；新增来源字段（`origin` / `origin_year` / `is_unresolved`）
- [x] 2.7 RED — 某队员该赛季无参赛 UTR 但推导链能取到值时，他仍出现在名单里，值为推导值且带来源标记与年份
- [x] 2.8 GREEN — 名单读取调用 group 1 的 `resolve_match_utr`；排序用推导后的值
- [x] 2.9 RED — 断言 `app.openapi()["paths"]` 里不存在指向名单或球队的写方法，并配一条「读路由确实注册了」的断言防守卫空转
- [x] 2.10 GREEN — 若断言失败则修正路由；无写方法时确认守卫本身不空转
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

### Attempt 2 Fixes

- [x] 2.F1 FIX — `get_team_roster` silently drops players with zero derivable match_utr (backend/app/rosters/query.py:228–232). This violates "MUST NOT 因为缺值就把这名队员从名单里略去" and creates inconsistency with `list_teams` (which counts memberships regardless). Root cause: `RosterPlayerOut.match_utr` is non-optional Decimal, but spec requires showing players even without a value. **Fix direction**: Either (1) relax `match_utr` to `Optional[Decimal]` and update contract D5 (changes response type shape) OR (2) return dropped players explicitly and let frontend handle rendering (requires API change). **Decision needed**: Which approach is acceptable? Once decided, update code + add test case for player with zero derivable values (add fixture player with no season UTR and no current_doubles to test_roster_api.py)

## 3. 排阵引擎换源、key 前缀与旧链接拒绝

### Contract
- **Spec**: 队员的 key SHALL 采用带前缀的形式（如 `p10531`），使纯数字的旧格式解析失败。系统 MUST 让旧格式失败，且 MUST 说明是链接过期，MUST NOT 返回一个笼统的错误。搜索结果 SHALL 报出因缺少参赛 UTR 而未参与计算的队员人数，MUST NOT 静默地把人从池子里去掉。搜索结果 SHALL 报出含估算值的队员人数与参赛 UTR 未裁决的队员人数。名单页与排阵引擎 SHALL 使用同一条链，对同一名队员给出同一个数字。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_lineup_api.py -q` → expected: 全部通过；key 断言已改为带前缀形式
- **Code**:
  - D4：两套 id 都是小整数且互不相干，静默沿用会让旧链接算出一套「看起来合法」而锁错人的阵容。`_parse_locks` 已是「解析不了就拒绝而不是跳过」，本次沿用，只把纯数字明确识别成**旧格式**并给出对应错误。
  - D1：`load_roster` 调用同一个 `resolve_match_utr`，MUST NOT 自己再写一遍取值规则。
  - 未参与计算的队员数、估算队员数、未裁决队员数三个计数随结果返回。
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — 断言 `load_roster` 的 `Candidate.key` 形如 `p<player_id>`；现返回 `roster_entries.id` 的字符串，失败
- [x] 3.2 GREEN — `load_roster` 换读新表，key 改为带前缀形式
- [x] 3.3 RED — `_parse_locks` 收到纯数字 key 时返回 4xx 且错误文本指出这是旧格式、队员编号已变；断言它不被当作新 key 解析
- [x] 3.4 GREEN — 在 `backend/app/routers/lineups.py` 加旧格式识别与专用错误
- [x] 3.5 RED — 某队 N 名队员四步都取不到参赛 UTR 时，结果报出 N，且候选与可达上限基于其余队员计算；N 为 0 时计数为 0
- [x] 3.6 GREEN — 缺值队员排除出候选池并计数
- [x] 3.7 RED — 结果含估算队员数与未裁决队员数两个计数；每名参与计算的队员带来源标记
- [x] 3.8 GREEN — 两个计数与逐人来源标记随结果返回
- [x] 3.9 RED — 跨模块一致性：同一名队员经 `get_team_roster` 与 `load_roster` 取到的参赛 UTR 与来源相同
- [x] 3.10 GREEN — 若不一致，收敛到同一个 `resolve_match_utr` 调用
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 名单导入器自锁

### Contract
- **Spec**: 导入器 SHALL 拒绝执行，或在执行前后刺眼地说明这些行不会出现在任何页面上。MUST NOT 只输出「+N 行」。拒绝 SHALL 可以被一个显式的开关绕过；绕过时仍 SHALL 打印同一条说明。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_roster_import.py -q` → expected: 全部通过，含拒绝与绕过两条新用例
- **Code**:
  - D8：用显式开关 `--i-know-it-is-not-read`，不用环境变量——绕过这件事该出现在命令历史里，而不是藏在某个 shell 的环境里被忘记。
  - 拒绝时 MUST NOT 写入任何数据，且以非零码退出。
- **Threshold**: 80

- [x] 4.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-4.md with the ### Contract block above
- [x] 4.1 RED — 默认运行导入命令时不写入任何数据、以非零码退出，且输出含「不会被任何页面读取」与「去哪里改名单」
- [x] 4.2 GREEN — 在 `backend/app/rosters/load.py` 的命令入口加默认拒绝
- [x] 4.3 RED — 带 `--i-know-it-is-not-read` 时数据照常写入 `roster_entries`，且**仍然**打印同一条说明
- [x] 4.4 GREEN — 加显式开关，说明在两条路径上共用同一份文案
- [x] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 名单页的估算标记与来源列

### Contract
- **Spec**: 当参赛 UTR 不是该赛季的冻结值而是按推导链取得的，该行 SHALL 在参赛 UTR 旁标注估算，逐字为 `估算 · <年份> 参赛值` 或 `估算 · 当前已认证值`，用 warning 档。MUST NOT 只写「估算」而不写年份。判定类别有三档：已认证 / 委员会审定 / 队长评定；为空时 MUST 呈现为「待定」。Appeal SHALL 以 `<类别> · Appeal` 呈现。页面 MUST NOT 再渲染总表原文。名单页 SHALL 逐字呈现 `当前 UTR 由人工维护，未与 UTR 官网同步`，用中性档。
- **Runtime**: `cd frontend && npm run test -- roster` → expected: 全部通过；token 断言经 `wrapper.classes()` 命中 warning 档
- **Code**:
  - D2：中文文案在前端拼，后端只给 `origin` / `origin_year`。
  - 色档沿用既有三档，不新增 token：估算用 `--color-warning-*`，说明用中性 `--color-border` / `--color-surface-muted`。danger 本次不用。
  - `frontend/lib/api.ts` 是唯一出口，新增字段的类型改在那里；改完记得跑 `npx tsc --noEmit`（vitest 只转译不校验类型）。
- **Threshold**: 70

- [x] 5.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-5.md with the ### Contract block above
- [x] 5.1 MOCK — open docs/superpowers/specs/mocks/2026-08-30-read-path-switch-mocks.html 第 2 节；抄下估算标记的两条逐字文案、类别四档映射、Appeal 的呈现形式与当前 UTR 说明；记下 warning 与中性两档的 token
- [x] 5.2 RED — vitest：推导值的行渲染 `估算 · 2025 参赛值`，且 `wrapper.classes()` 命中 warning 档 token；冻结值的行不出现估算标注
- [x] 5.3 GREEN — RosterTable 加估算标记；`frontend/lib/api.ts` 补 `origin` / `origin_year` / `is_unresolved` 字段类型
- [x] 5.4 RED — 类别四档（已认证 / 委员会审定 / 队长评定 / 待定）各一例；Appeal 时呈现 `<类别> · Appeal`；断言页面不出现 `Rated` / `Projected` / `Unrated` 原文
- [x] 5.5 GREEN — 「UTR 来源」列改为类别映射加 Appeal 后缀，移除原文渲染
- [x] 5.6 RED — 当前 UTR 列全为空时说明仍然呈现，逐字为 `当前 UTR 由人工维护，未与 UTR 官网同步`
- [x] 5.7 GREEN — 加该说明，中性档
- [x] 5.8 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开 2026 银组**最长**的那份名单（26 人）并把窗口调矮；对照 mocks 第 2 节核对文案与色档；确认长名单仍有自己的滚动容器、表头不被卷走
- [x] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 排阵页的四类提示与旧链接状态

### Contract
- **Spec**: 有队员因缺少参赛 UTR 未参与计算时，页面 SHALL 在顶部逐字呈现 `本队 N 人因缺少参赛 UTR 未参与计算`，用中性档；N 为 0 时 MUST NOT 呈现。未裁决 N 大于 0 时逐字呈现 `本结果含 N 名参赛 UTR 未裁决的队员，按较大值计算`，用 warning 档。推导值的数字旁 SHALL 逐字标注 `估算`；整套候选上 SHALL 逐字呈现 `含 N 个估算值，合法性待总表确认`。可达上限由含估算值的阵容达成时，上限旁 SHALL 标注 `含估算值`。收到纯数字旧 key 时页面 MUST 逐字呈现 `这个链接是旧格式（队员编号已变），请重新选择锁定的搭档`，并 SHALL 让人不手工改 URL 就能继续；MUST NOT 静默忽略旧 key 后照常出结果。
- **Runtime**: `cd frontend && npm run test -- lineup` → expected: 全部通过；token 断言经 `wrapper.classes()` 命中对应色档
- **Code**:
  - 旧链接失效用**中性**档，不是 danger——它是提示，不是危险操作。
  - 顶部现在可能同时出现四类提示（未裁决 / 未参与计算 / 截断 / 外援未校验），候选卡上还有估算。若变成提示墙，那是信息结构该收拢的信号；本次不预先设计，在 VISUAL DIFF 拿真实数据判断。
  - 锁定与排除仍完全由 URL 表达，MUST NOT 把选择只存在客户端状态里。
- **Threshold**: 70

- [x] 6.0 CONTRACT — write openspec/changes/read-path-switch/contracts/group-6.md with the ### Contract block above
- [x] 6.1 MOCK — open docs/superpowers/specs/mocks/2026-08-30-read-path-switch-mocks.html 第 3 节；抄下五条逐字文案与各自色档（旧链接为中性，非 danger）
- [x] 6.2 RED — vitest：未裁决 N>0 时顶部出现该句且命中 warning 档；N=0 时该句不出现
- [x] 6.3 GREEN — LineupStates 加未裁决提示
- [x] 6.4 RED — 未参与计算 N>0 时顶部出现该句且命中中性档；N=0 时不出现
- [x] 6.5 GREEN — 加未参与计算提示
- [x] 6.6 RED — 候选卡：推导值的数字旁出现 `估算`；整套上出现 `含 N 个估算值，合法性待总表确认`；十个数字全为冻结值时两处都不出现；可达上限含估算时旁标 `含估算值`
- [x] 6.7 GREEN — LineupResults 加三处标记
- [x] 6.8 RED — 旧格式链接：页面呈现旧链接文案、命中中性档、不呈现候选列表，且提供清空锁定重新选择的入口
- [x] 6.9 GREEN — LineupControls / 页面加旧链接状态与清空入口
- [x] 6.10 VISUAL DIFF — bring up dev stack；打开 2026 银组一支真实球队的排阵页，构造未裁决与缺值两种情形；对照 mocks 第 3 节核对；**重点看顶部是否变成提示墙**，若是则在此收拢并记录理由
- [ ] 6.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-6.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 7. 验证与 ship

- [ ] 7.1 Run backend test suite — `cd backend && ./.venv-std/Scripts/python.exe -m pytest`（本机 `uv run` 被 Application Control 拦，见 CLAUDE.md）；跑完本地库会被 TRUNCATE，需要时用 `bash backend/scripts/reseed-local.sh` 补种
- [ ] 7.2 Run frontend test suite — `cd frontend && npm run test`
- [ ] 7.3 Run `cd frontend && npx tsc --noEmit` — vitest 只转译不校验类型，这条必须单独跑
- [ ] 7.4 手工核对部署顺序：后端先上、前端后上（反序会让前端读到不存在的字段）
- [ ] 7.5 Run superpowers:verification-before-completion（跑 project.test_commands、console.log 扫描、以及 openspec/config.yaml 里的全部 custom_verification_checks）
