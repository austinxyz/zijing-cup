## 1. 球队与名单的数据模型与 migration

### Contract
- **Spec**: 系统 SHALL 以 `(赛季, 组别)` 为维度存储球队与球员名单。一条名单记录是**该赛季该队的一行快照**，其唯一键为 `(赛季, 组别, 球队, 姓, 名)`。系统 MUST NOT 依据姓名把不同赛季或不同组别的记录自动归并为同一个人。 / 每条名单记录 SHALL 保存参赛 UTR、原始的 `DUTR Status` 文本、来源依据原文（总表的 `Notes` 列）与取样窗口的每日 UTR 值。来源依据 MUST 原样保留，MUST NOT 被规范化或丢弃。 / 名单记录 SHALL 可选携带 UTR profile ID。同一 profile ID 在同一赛季同一组别内 MUST 唯一；不同组别之间 MUST 允许重复。未关联 profile ID 的记录 MUST 不受影响。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_model.py` → expected: schema 归属、可空性与唯一约束测试全部通过
- **Code**:
  - 两张表 `teams` / `roster_entries`，**不建 `players` 表** —— 总表无 UTR profile ID，跨赛季同一性无法由数据证明，建实体会逼出基于姓名的自动归并（design.md D1）
  - 每日 UTR 值用 `numeric[]` 而非单独的表：整体读写、从不单查某一天（D2）
  - `rating_class` 可空；`utr_profile_id` 部分唯一索引 `where not null`，作用域是组别而非全局（规则允许一人同时参加金银两组）
  - `is_borrowed_player` 用**可空**布尔而非 `not null default false`：未标注与「确认不是外援」是两回事，把前者呈现为后者会让下游算出未经检验的结论（design.md D1b）
  - migration 首行 `set search_path to zijing_cup, public;`，否则 DDL 以 `postgres` 角色落进 `public`（对方应用的 schema）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/roster-import/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — pytest：断言 `teams` 与 `roster_entries` 存在且位于 `zijing_cup` schema、`public` 中无同名表；断言 `rating_class` / `source_note` / `utr_profile_id` 可空而 `match_utr` / `dutr_status` 非空
- [x] 1.2 GREEN — 新增 `supabase/migrations/<timestamp>_create_team_rosters.sql`，建两张表、外键（`teams` → `divisions(season_year, code)`）与唯一索引，首行设置 search_path
- [x] 1.3 RED — pytest：断言 `roster_entries(team_id, last_name, first_name)` 唯一；断言同一 `utr_profile_id` 在同组别内插入第二条被拒、在另一组别可插入；断言 `daily_utrs` 能存回多个小数值；断言 `is_borrowed_player` 可为 NULL（未标注）且能存 true/false 三态
- [x] 1.4 GREEN — 实现 `backend/app/models/roster.py` 的 SQLModel 定义，可空性与 migration 一致
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. CSV 解析与评级类别判定

### Contract
- **Spec**: 系统 SHALL 依据 `DUTR Status` 判定规则评级类别：`Rated` 为第 1 类已认证，`Projected` 为第 2 类委员会审定。`Unrated` 的类别取决于该队员是否有 USTA 比赛历史，该信息不在总表中，因此 MUST 留空待人工判定。系统 MUST NOT 为 `Unrated` 猜测一个类别。 / 导入 MUST 识别并跳过总表中的非名单行，MUST NOT 将其建为球队，且被跳过的行 MUST 出现在对账报告中。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_parse.py` → expected: 三种状态判定、Appeal 后缀、伪队名跳过、不可解析行的测试全部通过
- **Code**:
  - `Unrated` 一律留 NULL。不要用 `Notes` 自动推断类别——该映射未经组委会确认，而 `self_rated` 直接决定「上场 ≤2 名且不得互相搭档」这条硬约束，猜错会放出非法阵容且被「已自动判定」的外观掩盖（design.md D3）
  - `/ Appeal` 后缀不参与判定，但 `dutr_status` 保留完整原文
  - 列名按位置与前缀匹配，不硬编码完整列名——取样窗口日期逐年变（2025 是 09/22，2026 是 09/21）；无法识别的列进报告而非静默丢弃（D6 风险项）
  - 解析阶段纯函数：输入 CSV 文本，输出记录与报告，不碰数据库
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/roster-import/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — pytest：`Rated` → verified、`Projected` → committee、`Unrated` → None；`Rated / Appeal` → verified 且 `dutr_status` 保留 `"Rated / Appeal"` 原文；`Unrated / Appeal` → None
- [x] 2.2 GREEN — 实现 `backend/app/rosters/parse.py` 的行解析与评级类别判定
- [x] 2.3 RED — pytest：`Borrowed Player` 与 `Unrated/Projected/Appeal` 两个伪队名的行被跳过且出现在报告的「跳过」一节；字段缺失的行不产出记录且出现在报告的「无法解析」一节并带原因
- [x] 2.4 GREEN — 实现伪队名识别与不可解析行的收集
- [x] 2.5 RED — pytest：取样窗口列名改为另一组日期（模拟 2026）时仍能解析出每日 UTR 值；出现未知列时该列进报告而不导致失败
- [x] 2.6 GREEN — 按前缀匹配实现列定位与未知列上报
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 导入命令：幂等写入、--check 与对账报告

### Contract
- **Spec**: 系统 SHALL 提供一条导入命令，从总表导出的 CSV 写入名单。该命令 MUST 幂等：在同一份 CSV 上重复执行，数据库最终状态一致且不产生重复记录。CSV MUST NOT 提交到版本库。 / 导入命令 SHALL 提供 `--check` 模式：只比对数据库与 CSV，不做任何写入。一致时以退出码 0 结束；不一致时以非零退出码结束并指出差异所在的球队与球员。 / 总表在各 tab 之间并不自洽。导入 SHALL 产出对账报告，指出可疑之处而不是静默给出一份看起来完整的名单。报告 MUST 包含行数异常的球队；当同时提供了可选的排名表 CSV 时，MUST 另外列出有排名无名单与有名单无排名的球队。 / 版本库 MUST NOT 包含任何真实球员数据；测试数据 MUST 全部使用虚构姓名。 / 导入 MUST NOT 写入或清除由人工维护的字段，重复导入 MUST 保留它们已有的值；导入只拥有 CSV 携带的字段。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_import.py` → expected: 幂等、漂移检测、check 不写库、对账三节、同队重名报错的测试全部通过
- **Code**:
  - `parse → read → compare → write` 四步，`--check` 与写入**共用同一个比对函数**；两套比对逻辑会产生「check 说一致、导入却写了东西」（competition-rules 已踩过的形状，design.md D4）
  - 对账报告在两种模式下都产出——`--check` 也要能回答「数据源现在还对不对得上」
  - 排名表是**可选的第二个 CSV 参数**，只读来比对、不落表；这让「TPI 不入库」与「报出有排名无名单」不矛盾
  - 同队重名报错而非覆盖，且该批次不写入任何数据——这是快照语义唯一会被悄悄破坏的地方
  - 球队 code 原样存，不拆联队成分、不做别名归并（D5）
  - **比对与写入只覆盖 CSV 拥有的字段**。`is_borrowed_player`、`utr_profile_id`、以及 `Unrated` 行的 `rating_class` 由人工维护，导入器一次都不碰；`--check` 的比对同样忽略它们，否则人工设一个外援标记就会让漂移检测永远报红（design.md D1b）
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/roster-import/contracts/group-3.md with the ### Contract block above
- [x] 3.1 建立 `backend/data/rosters/` 目录（`.gitkeep` + 说明 CSV 列格式的 `README.md`），并在 `.gitignore` 忽略该目录下的 `*.csv`
- [x] 3.2 RED — pytest：用虚构姓名的小 CSV，空库导入后球队与名单条目落库，参赛 UTR、原始状态、来源依据、每日 UTR 值都正确
- [x] 3.3 GREEN — 实现 `backend/app/rosters/load.py` 的读库、比对与写入
- [x] 3.4 RED — pytest：同一 CSV 连续导入两次，第二次报告为空且数据（含主键）与第一次完全一致；改一名球员的参赛 UTR 后重新导入，该条更新且其他球队记录的主键不变
- [x] 3.5 GREEN — 补齐幂等与差异写入
- [x] 3.6 RED — pytest：`--check` 一致时退出码 0；CSV 改动未导入时非零退出且输出含球队与球员；`--check` 执行后数据未变
- [x] 3.7 GREEN — 实现 `--check`，复用 3.3 的比对函数
- [x] 3.8 RED — pytest：只有 1 条记录的球队出现在报告的「行数异常」一节且仍被导入；提供排名表时报出「有排名无名单」与「有名单无排名」两节且排名数值未入库；不提供排名表时两节缺席且不报错
- [x] 3.9 GREEN — 实现对账报告与可选排名表比对
- [x] 3.10 RED — pytest：人工设置外援标记、关联 profile ID、回填某条 `Unrated` 的评级类别后重新导入，三者都保持不变，而该记录来自 CSV 的参赛 UTR 仍按差异更新；带外援标记时 `--check` 不报漂移
- [x] 3.11 GREEN — 按字段归属实现比对与写入的划界
- [x] 3.12 RED — pytest：CSV 中同一球队出现两个同姓同名球员时导入报错，且该批次数据未写入
- [x] 3.13 GREEN — 实现同队重名的拒绝
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 名单只读端点

### Contract
- **Spec**: 后端 SHALL 提供球队列表与球队名单两个只读端点。系统 MUST NOT 提供任何修改名单的 HTTP 端点 —— 本项目没有 per-user 登录，公开可写的名单入口意味着任何人都能覆盖全部球队名单。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_api.py` → expected: 两个端点的 200 与三类 404 路径、无写方法断言全部通过
- **Code**:
  - 一次取出球队与其名单条目组装，不做 N+1（沿用 competition-rules 的做法）
  - 只读：不新增任何写端点；审计路由用 `app.openapi()["paths"]`，**不要遍历 `app.routes`** —— 当前 FastAPI 版本把 included router 存成单个不透明条目，遍历会看不见任何 `/api` 路由而空转通过（CLAUDE.md Pitfalls）
  - 路由仍在既有的 `X-Backend-Secret` 中间件之后
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/roster-import/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — pytest：球队列表端点返回 200 与该组别球队清单；名单端点返回 200 且含参赛 UTR、原始状态、评级类别、来源依据与外援标记；未知赛季、未知组别、未知球队三种情况均返回 404 而非空列表
- [ ] 4.2 GREEN — 实现 `backend/app/rosters/query.py` 的组装与 `backend/app/routers/rosters.py` 的路由，并在 `main.py` 注册
- [ ] 4.3 RED — pytest：读 `app.openapi()["paths"]`，断言不存在指向名单或球队资源的写方法；并断言两个读端点确实已注册（防止守卫空转）
- [ ] 4.4 GREEN — 如有必要收紧路由定义使 4.3 通过
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 真实数据导入与验证收尾

- [ ] 5.1 新增一条 `custom_verification_checks`：扫描仓库确保未混入真实球员数据（至少覆盖 `backend/data/rosters/` 下的 `*.csv` 未被追踪）
- [ ] 5.2 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 5.3 Run frontend test suite — `cd frontend && npm run test`，确认无回归（本次前端无改动，跑一遍确保未误伤）
- [ ] 5.4 e2e 不适用（`project.e2e_command` 为空），跳过并在此注明
- [ ] 5.5 用 2025 总表导出的真实 CSV 执行一次导入，核对：金组 6 队 120 人、银组 13 队 211 人、两个伪队名不在球队表、`SJTU` 出现在「行数异常」一节；随后 `--check` 退出码 0。**导入前确认 `DATABASE_URL` 指向本地栈**——测试 fixture 会清空表（CLAUDE.md Pitfalls）
- [ ] 5.6 Run superpowers:verification-before-completion —— 跑 `project.test_commands` 与 `project.custom_verification_checks`（console.log 扫描、敏感变量泄漏扫描、客户端 bundle 扫描、migration 的 `zijing_cup` 限定检查、真实球员数据扫描）
