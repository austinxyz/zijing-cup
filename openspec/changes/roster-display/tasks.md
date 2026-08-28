## 1. 球队显示名：数据模型与字段归属

### Contract
- **Spec**:
  - 球队 SHALL 可以带一个可选的中文显示名。该字段由人工维护，不来自名单 CSV，
    因此名单导入 MUST NOT 写入或清除它。没有显示名的球队 MUST 以 code 呈现，
    系统 MUST NOT 为其生成或推断一个名字。
  - 导入 MUST NOT 写入或清除由人工维护的字段，重复导入 MUST 保留它们已有的值；
    导入只拥有 CSV 携带的字段。人工维护的字段有四个：外援标记、UTR profile ID、
    `Unrated` 记录被人工回填的评级类别，以及球队的显示名。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_model.py tests/test_roster_models_roundtrip.py tests/test_roster_import.py` → expected: 全部通过；新增的显示名字段归属测试在实现前先红
- **Code**:
  - migration 必须 schema-qualified 或以 `set search_path to zijing_cup, public;` 开头；
    列可空且**无默认值**（未配置 ≠ 空字符串）。
  - 名单导入会 upsert `teams` 行 —— 必须显式只写它拥有的字段。写错就会在每次导入
    名单时静默清空所有显示名。
  - 字段归属测试必须导入一份**有差异**的 CSV，不能导无差异的：无差异时导入器根本
    不写，测试会空转（`roster-import` 有三个字段归属测试曾因此假通过）。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/roster-display/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `tests/test_roster_model.py`：断言 `Team` 有可空的 `display_name` 且默认为 None（未配置 ≠ 空串）
- [x] 1.2 GREEN — `supabase/migrations/` 新增 migration 给 `zijing_cup.teams` 加 `display_name text`（可空、无默认值）；`app/models/roster.py` 加字段；`supabase db reset` 应用
- [x] 1.3 RED — `tests/test_roster_models_roundtrip.py`：写入带显示名与不带显示名的两支球队，读回分别为该值与 None
- [x] 1.4 GREEN — 最小实现使往返通过
- [x] 1.5 RED — `tests/test_roster_import.py`：先给球队设显示名，再导入一份**与库中有差异**的名单 CSV（改掉某球员的参赛 UTR），断言显示名仍在、且该球员的 UTR 已更新
- [x] 1.6 GREEN — 使名单导入的 `teams` upsert 只写它拥有的字段，不触碰 `display_name`
- [x] 1.7 RED — `tests/test_roster_import.py`：库中球队带显示名时执行名单导入的 `--check`，断言报告为 clean（显示名不算漂移）
- [x] 1.8 GREEN — 最小实现使 `--check` 忽略显示名
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 球队显示名：seed 与导入命令

### Contract
- **Spec**:
  - 球队显示名 SHALL 以 seed 文件为唯一事实来源，由一条导入命令写入数据库。
    导入 SHALL 只写入差异，重复执行 MUST 得到一致的最终状态。导入命令 SHALL
    提供只读的漂移检测模式。seed 中未列出的球队 MUST 保持无显示名，
    MUST NOT 因未列出而报错。
- **Runtime**: `cd backend && uv run pytest tests/test_team_names.py` → expected: 新增测试全部通过，含首次导入、幂等、改名、移除即清空、未覆盖不报错、未匹配条目被报告、`--check` 漂移检出
- **Code**:
  - 沿用 `load_rules` 的形态：解析 → 读库 → 比对 → 只写差异，`--check` 复用
    同一个比对函数并转成退出码。不要写第二套比对逻辑。
  - **从 seed 中消失的条目按清空处理** —— 否则 seed 成了只增不减的叠加，
    不再是事实来源。这与规则 seed 的语义一致。
  - seed 指向不存在的球队要**报告未匹配**，不是静默忽略、也不是报错退出：
    先导名单再导显示名是正常顺序，但拼错 code 必须被看见。
  - CLI 输出含中文，需 `configure_stdout()`（Windows cp1252 会崩）。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/roster-display/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `tests/test_team_names.py`：解析一份 TOML seed，得到 (赛季, 组别, code, 显示名) 记录；缺字段或赛季组别不一致时报错
- [x] 2.2 GREEN — `app/seeds/team_names.py`（或同层模块）实现解析，`tomllib` 读取，零新依赖
- [x] 2.3 RED — 空库首次导入：seed 中列出的球队各自获得显示名；未列出的保持 None 且不报错
- [x] 2.4 GREEN — 实现「解析 → 读库 → 比对 → 只写差异」的导入
- [x] 2.5 RED — 幂等：同一份 seed 再导一次，报告无变化
- [x] 2.6 GREEN — 最小实现使重复导入无写入
- [x] 2.7 RED — 改名与移除：seed 改值后重导则更新；seed 删除条目后重导则清空该球队显示名，且球队与其名单记录不受影响
- [x] 2.8 GREEN — 实现更新与清空
- [x] 2.9 RED — seed 指向库中不存在的球队时，报告中列出该未匹配条目；命令不因此失败
- [x] 2.10 GREEN — 实现未匹配条目的报告
- [x] 2.11 RED — `--check`：库与 seed 不一致时以非零退出码结束并指出差异
- [x] 2.12 GREEN — 复用同一个比对函数实现 `--check`
- [x] 2.13 RED — CLI 在 cp1252 编码的输出流上打印中文报告不崩溃
- [x] 2.14 GREEN — 命令入口调用 `configure_stdout()`
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 只读端点带出显示名与性别构成

### Contract
- **Spec**:
  - 后端 SHALL 提供球队列表与球队名单两个只读端点。球队列表 SHALL 为每支球队
    带出名单人数与按性别的人数分布；性别为空的记录 MUST 单独计数，MUST NOT
    并入任一性别。两个端点 SHALL 带出球队的显示名（未配置时为空）。系统
    MUST NOT 提供任何修改名单或球队的 HTTP 端点。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_api.py` → expected: 全部通过，含性别三档自洽、显示名带出、无写方法的断言
- **Code**:
  - 性别计数在**后端一次聚合查询**里算，不要退化成先查球队再逐队查性别
    （18 支队 = 18 次额外往返）。
  - 第三档「性别未填」不是冗余：`gender` 可空，并进任一侧会让那一侧人数
    凭空多一个人，而人数正是这一列存在的理由。2025 数据里该档恒为 0。
  - 「无写方法」的断言必须读 `app.openapi()["paths"]`，不能遍历 `app.routes`
    —— 当前 FastAPI 版本把 `include_router` 存成单个不透明条目，遍历它看不见
    任何 `/api` 路由而静默通过。
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/roster-display/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — `tests/test_roster_api.py`：球队列表每项带 `display_name`（未配置为 null）
- [x] 3.2 GREEN — `TeamSummaryOut` / `TeamOut` 加字段，`query.py` 带出
- [x] 3.3 RED — 球队列表每项带男 / 女 / 性别未填三档人数，且三者之和等于总人数；构造一条 `gender` 为 NULL 的记录验证第三档
- [x] 3.4 GREEN — `list_teams` 的聚合查询加 `gender` 维度，应用层合并成三档；保持一次查询
- [x] 3.5 RED — 名单端点的响应带该球队的 code 与 `display_name`
- [x] 3.6 GREEN — `TeamRosterOut.team` 带出显示名
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 球队列表页与空状态

### Contract
- **Spec**:
  - 前端 SHALL 在 `/[season]/[division]/teams` 提供球队列表，在
    `/[season]/[division]/teams/[code]` 提供某支球队的名单。选中的球队 MUST 由
    URL 表达，MUST NOT 只存在于客户端状态。
  - 未选中球队时，内容区 MUST 呈现提示选择球队的空状态，MUST NOT 呈现一张
    空的名单表格。
  - 球队列表的每一行 SHALL 显示球队 code、名单总人数，以及男、女各自的人数。
    性别为空的记录 MUST 单列一档计数。列表 SHALL 按 code 排序。
  - 名单页 MUST 在服务端取数，取数 MUST 经 `frontend/lib/api.ts` 单一出口。
    客户端 bundle MUST NOT 包含后端地址或共享密钥。
  - 已实现的导航项 SHALL 是指向该赛季组别下对应页面的链接。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含球队列表渲染、空状态、侧栏「队伍」是链接而「分析」不是
- **Code**:
  - 球队列放在 `teams/layout.tsx`（两条路由下都在），空状态是 `teams/page.tsx`。
    切换球队时球队列不重新挂载。
  - **空状态不重定向到第一支球队** —— 重定向会让地址栏自己变，而「第一支」
    是任意的（字母序下是 `BUAA-UMN-UCB`），读起来像系统替用户选了一支队。
  - 取数只经 `lib/api.ts`，Server Component 内完成。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70（视觉判断有固有主观性）

- [x] 4.0 CONTRACT — write openspec/changes/roster-display/contracts/group-4.md with the ### Contract block above
- [x] 4.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-28-roster-display-mocks.html`（对应 `design/Teams.dc.html` 与 `design/TeamsEmpty.dc.html`）；记下 token 与逐字文案：「从左侧选一支球队」「球队 · 18」「未开放」
- [x] 4.2 RED — `lib/api.ts` 的两个取数函数：球队列表与球队名单，类型含 `display_name` 与三档性别人数；断言不带 `NEXT_PUBLIC_` 前缀的变量不进客户端
- [x] 4.3 GREEN — 在 `lib/api.ts` 实现两个取数函数
- [x] 4.4 RED — 球队列表渲染：每行显示 code、总人数、男/女人数；有显示名的补一行灰字，没有的只显示 code 且不生成名字；按 code 排序
- [x] 4.5 GREEN — 实现 `teams/layout.tsx` 的球队列
- [x] 4.6 RED — 空状态：`teams/page.tsx` 渲染提示文案，且不渲染名单表格的表头或行；不重定向
- [x] 4.7 GREEN — 实现空状态页
- [ ] 4.8 RED — 侧栏：「队伍」是指向 `/[season]/[division]/teams` 的链接且不再标注未开放；「分析」仍是禁用态且不是链接
- [ ] 4.9 GREEN — 改 `Sidebar.tsx`：「队伍」由 `PendingNavItem` 改为 `Link`
- [x] 4.10 VISUAL DIFF — `npm run dev --prefix frontend`，访问 `/2025/silver/teams`，对照 `design/TeamsEmpty.dc.html` 核对 token、配色与逐字文案（桌面 1440px）。移动端已于 2026-08-28 移出本 change 范围——应用壳从未实现窄屏版式，规则页在 375px 下同样被压缩，属后续 `mobile-shell`
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 名单页与 UTR 来源呈现

### Contract
- **Spec**:
  - 球队名单 SHALL 按参赛 UTR 从高到低展示，列出姓名、性别、参赛 UTR 与
    UTR 来源。前端 MUST NOT 自行重新排序。
  - 名单的「UTR 来源」SHALL 同时呈现系统判定的评级类别与总表的原始状态文本。
    评级类别为空时 MUST 呈现为「待定」，MUST NOT 呈现为自评、委员会审定
    或任何其他具体类别。
  - 名单页取数失败时 MUST 只把内容区换成错误态，侧栏与应用壳 MUST 仍然渲染。
    页面 SHALL 提供加载态而不是白屏。
  （移动端版式已移出本 change，见 specs/team-roster-ui/spec.md 末尾说明。）
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含排序不被前端改写、三种 UTR 来源呈现、「自评」字样不出现、未知球队 404
- **Code**:
  - 排序只在后端做一次。前端直接渲染返回顺序 —— 两处各排一次在参赛 UTR
    相同时会给出不同先后，而 UTR 打平在这份数据里很常见（多人压在同一个 cap）。
  - 「待定」用 `--color-warning`；女队员数偏少只加字重不上色 —— 同一屏两种
    「注意但不是错误」用同一颜色会分不清指什么。
  - `teams/[code]/error.tsx` 替换的只是名单区，球队列与侧栏都还在。
  - 移动端名单用行卡片而非表格的那条设计留给后续 `mobile-shell`；本组只做桌面。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

- [ ] 5.0 CONTRACT — write openspec/changes/roster-display/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — 打开 mocks 中对应 `design/Teams.dc.html` 的一节；记下表格 token（表头 34px、表行 40px）与逐字文案「已认证」「委员会审定」「待定」「参赛 UTR · 赛前冻结」
- [ ] 5.2 RED — 名单表按后端给出的顺序渲染：构造两条参赛 UTR 相同的记录，断言页面先后与取数返回的先后一致（前端不重排）
- [ ] 5.3 GREEN — 实现 `teams/[code]/page.tsx` 的名单表
- [ ] 5.4 RED — UTR 来源三种呈现：`Rated` → 「已认证」+ 原文；`Projected` → 「委员会审定」+ 原文；`rating_class` 为 null → 「待定」。并断言整页不出现「自评」字样
- [ ] 5.5 GREEN — 实现 UTR 来源单元格
- [ ] 5.6 RED — `Rated / Appeal` 显示「已认证」与完整原文（后缀不改变类别）
- [ ] 5.7 GREEN — 最小实现使后缀不参与判定
- [ ] 5.8 RED — 未知球队 code 呈现未找到而不是空名单；取数失败时侧栏与球队列仍渲染
- [ ] 5.9 GREEN — 实现 `teams/[code]/error.tsx` 与 `loading.tsx`，未知 code 走 notFound
- [ ] 5.10 VISUAL DIFF — 访问 `/2025/silver/teams/PKU`，对照 `design/Teams.dc.html` 核对 token、配色与逐字文案（桌面 1440px）。移动端不在本 change 范围
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 验证与上线

- [ ] 6.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 6.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 6.3 e2e 不适用（`project.e2e_command` 为空），跳过并在此注明
- [ ] 6.4 用 2025 真实数据本地验一遍：金组 6 队 120 人、银组 18 队 339 人；某队三档性别人数之和等于总人数；`Unrated` 行显示「待定」。**导入前确认 `DATABASE_URL` 指向本地栈**——测试 fixture 会清空表，跑完 pytest 需先补跑 `load_rules` 与名单导入（CLAUDE.md Pitfalls）
- [ ] 6.5 Run superpowers:verification-before-completion —— 跑 `project.test_commands` 与全部 `project.custom_verification_checks`（console.log 扫描、敏感变量泄漏扫描、客户端 bundle 扫描、migration 的 `zijing_cup` 限定检查、真实球员数据扫描）
- [ ] 6.6 上线：`git push`（Render + Vercel 自动部署）；**手工在 Supabase Dashboard 的 SQL Editor 执行本次 migration**（共享项目禁用 `db push` / `migration repair`）；远程执行球队显示名 seed 导入，完成后立即清除 `DATABASE_URL`；远程复核球队列表的显示名与人数分布
