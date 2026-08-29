## 1. 数据模型与 migration

### Contract
- **Spec**:
  - 系统 SHALL 把队员存成跨赛季的实体，字段为姓、名、性别、当前单打 UTR 与其状态、当前
    双打 UTR 与其状态、UTR 档案链接。队员 MUST NOT 依赖队伍存在。
  - 当前 UTR 的状态取 `unrated` / `projected` / `rated`。这与参赛 UTR 的三档状态是两个
    互不相干的枚举，两者 MUST NOT 共用一张表，也 MUST NOT 互相推导。
  - 系统 SHALL 把参赛 UTR 存成 `(队员, 赛季)` 维度的记录，带状态（已认证/组委会审定/
    队长评定）、Appeal 标记、以及来源（`预填`/`组委会总表`/`admin裁决`）。Appeal MUST 是
    可叠加在任一状态上的独立标记，MUST NOT 做成第四种状态。
  - 成员关系带代表学校、是否外援、是否外卡；同一名队员 SHALL 能同时属于同一赛季的金组与
    银组两支队，MUST NOT 建成一对一。代表学校是自由文本，MUST NOT 关联学校表。
- **Runtime**: `cd backend && uv run pytest tests/test_players_model.py` → expected: 全部通过，含「(人,赛季) 唯一」「一人两组两条成员关系」「Appeal 与状态可共存」「当前 UTR 状态枚举里没有『队长评定』」四类断言
- **Code**:
  - 三张新表建在 `zijing_cup` schema，migration 以 `set search_path to zijing_cup, public;`
    开头（D1）。`roster_entries` 本次一行都不改——回滚成立的前提就是它没被动过。
  - 未裁决用一条记录带 `value` / `alt_value` / `is_unresolved` 表示，**不存成两行**：两行
    会让「(人,赛季) 唯一」失效，把冲突扩散给每一个读它的地方（D3）。
  - 全程 `Decimal`；UTR 是精确小数，float 只在边界上出错。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/player-management/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `tests/test_players_model.py`：建一名不属于任何队伍的队员并读回；两个当前 UTR 各有各的状态
- [x] 1.2 GREEN — 新增 migration 与 `app/models/players.py` 的 `Player` 映射
- [x] 1.3 RED — 同一 `(人, 赛季)` 插入两条参赛 UTR 被唯一约束拒绝；一条记录可同时带状态与 Appeal 标记；来源字段三种取值都能存
- [x] 1.4 GREEN — 实现 `player_season_utrs`（含 `value` / `alt_value` / `is_unresolved` / 来源）
- [x] 1.5 RED — 一名队员在同赛季金银两组各有一条成员关系可并存；同一 `(人, 队伍)` 重复插入被拒绝；代表学校是自由文本
- [x] 1.6 GREEN — 实现 `player_team_memberships`（含代表学校、外援、外卡）
- [x] 1.7 RED — 断言当前 UTR 的状态枚举与参赛 UTR 的状态枚举是两个不同的取值集合
- [x] 1.8 GREEN — 两个枚举各自定义，互不引用
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - attempt 1 **BLOCK**：`SeasonLock.locked_at` 对着 NOT NULL 列发显式 NULL，锁赛季必抛 NotNullViolation。补回归测试后改成由数据库盖时间戳。
  - attempt 2 **STATUS: PASS** — scores: spec 100, runtime 100, code 95, total 99 ≥ 80

## 2. 迁移命令

### Contract
- **Spec**:
  - 系统 SHALL 提供一条迁移命令，把 `roster_entries` 中 2025 与 2026 两个赛季的全部行读进
    新表：按规范化姓名（姓与名各自 `trim` 后转小写再拼接）归并成队员，每行生成一条成员
    关系，每行的参赛 UTR 生成 `(队员, 赛季)` 记录。
  - 迁移 MUST NOT 自行裁决冲突：同一队员同一赛季出现两个不同的参赛 UTR 时，标记为未裁决
    并保留两个值。
  - 迁移 SHALL 可重复执行而不产生重复数据。
- **Runtime**: `cd backend && uv run pytest tests/test_players_migrate.py` → expected: 全部通过，含归并按规范化姓名、金银两组不同值判为未裁决、重复执行不产生重复、两季全部行都被认领
- **Code**:
  - 归并与冲突判定是纯函数，输入是已读出的行、输出是决定，不碰数据库（D6）——这些规则要
    用虚构数据密集测试。
  - 命令形状与 `load_rules` / `load_rosters` 一致：解析 → 读现状 → 比对 → 只写差异，
    `--check` 复用同一个比对函数并转成退出码（D7）。**不写进 migration**：远程是手工在
    Dashboard 执行 SQL 的，几百行 DML 在那里既不可观测也不可重试。
  - **不做模糊匹配**（D2）：`Xie Yuntao "Young"` 这类别名与两栏填反的行，任何自动规则都会
    在一部分行上猜错且不留痕迹。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/player-management/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `tests/test_players_migrate.py`：规范化姓名的纯函数——大小写与前后空格不同的两行归并成一人；带引号别名不被拆开
- [x] 2.2 GREEN — `app/players/merge_rules.py` 实现规范化与归并（纯函数）
- [x] 2.3 RED — 同一人同赛季两个不同值 → 未裁决且两个值都保留，`value` 是较大者；两个值相同 → 不产生未裁决
- [x] 2.4 GREEN — 实现冲突判定（纯函数）
- [x] 2.5 RED — 在一份虚构的 `roster_entries` 快照上跑迁移：每行都有对应成员关系，两季互不干扰
- [x] 2.6 GREEN — `app/players/migrate.py` 实现迁移命令与 `--check`
- [x] 2.7 RED — 连续执行两次，队员数、成员关系数、参赛 UTR 记录数都与执行一次相同
- [x] 2.8 GREEN — 使迁移幂等
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - **STATUS: PASS** — attempt 1, scores: spec 100, runtime 100, code 95, total 99 ≥ 80

## 3. 管理员鉴权

### Contract
- **Spec**:
  - 所有修改数据的路由 SHALL 要求管理员凭据（`X-Admin-Secret`）。这个检查 MUST 沿用现有
    共享密钥中间件的形状——减法式覆盖：新加的写路由不声明任何东西就已经受保护。
  - `ADMIN_SECRET` 未配置时，系统 SHALL 拒绝全部写请求。缺失的密钥 MUST 意味着「谁都进
    不来」，MUST NOT 意味着「谁都能进」。
  - 读路由 MUST NOT 因此改变：它们继续只要求现有的共享密钥。
- **Runtime**: `cd backend && uv run pytest tests/test_admin_auth.py tests/test_roster_api.py` → expected: 全部通过，含无凭据写请求被拒、密钥未配置时全拒、新增写路由自动受保护、读路由不受影响；且 `test_roster_api.py` 里那条守卫被改写而不是删除
- **Code**:
  - 按 **HTTP 方法**判定而不是路由前缀（D4）：前缀靠人记得，方法是请求自带的属性，漏不掉。
  - 两个条件分开写，不折成 `if expected and provided != expected`——后者在变量未设置时会
    放行一切，正是现有注释里写明要避免的失败模式。
  - **不用 FastAPI 依赖**：依赖是加法式的，忘了挂就没有保护。
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/player-management/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — `tests/test_admin_auth.py`：对一条临时写路由，不带 `X-Admin-Secret` 返回 401/403；带正确值放行
- [x] 3.2 GREEN — 在现有中间件里加按方法判定的第二层
- [x] 3.3 RED — `ADMIN_SECRET` 未配置时，即使带着某个值，写请求也被拒
- [x] 3.4 GREEN — 实现缺失即全拒（两个条件分开写）
- [x] 3.5 RED — 新增一条写路由且不为它声明任何鉴权，它同样被保护；读路由带现有共享密钥照常返回
- [x] 3.6 GREEN — 使覆盖是减法式的
- [x] 3.7 RED — 改写 `test_roster_api.py` 里「不存在写方法」那条断言：改成「所有写方法都在管理员保护之下」，并用一条临时未受保护的写路由验证守卫会红
- [x] 3.8 GREEN — 使改写后的守卫通过
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - **STATUS: PASS** — attempt 1, scores: spec 100, runtime 100, code 95, total 99 ≥ 80

## 4. 队员与成员关系的读写端点

### Contract
- **Spec**:
  - 队员 MUST NOT 依赖队伍存在——一名不属于任何队伍的队员仍然可以被创建与维护。
  - 系统 SHALL 支持把队员加入或移出某支队伍（队伍属于某个 `(赛季, 组别)`）。
  - 移出队伍时，队员本身仍然存在，其各赛季的参赛 UTR 不受影响。
  - 参赛 UTR 可以先用当前 UTR 预填，之后被组委会总表的值覆盖时，来源从 `预填` 变成
    `组委会总表`。
- **Runtime**: `cd backend && uv run pytest tests/test_players_api.py` → expected: 全部通过，含建/改/删队员、加入与移出队伍、移出不删人、预填后被覆盖来源随之改变、未知资源 404、格式非法 4xx 而非 500
- **Code**:
  - 路由只负责读库、调纯函数、组装响应；归并与冲突逻辑不得下沉到路由里（D6）。
  - 写入的事务边界与唯一约束冲突的处理留在 command 层，纯规则不碰数据库。
  - 全程 `Decimal`。
- **Threshold**: 80

- [x] 4.0 CONTRACT — write openspec/changes/player-management/contracts/group-4.md with the ### Contract block above
- [x] 4.1 RED — `tests/test_players_api.py`：POST 建一名只有姓名性别的队员返回 201 且可读回；PATCH 改字段；DELETE 删掉一名没有任何记录的队员
- [x] 4.2 GREEN — `app/routers/players.py` 与 `app/players/command.py` 实现队员 CRUD
- [x] 4.3 RED — 把队员加入某队伍后可读回该成员关系（含代表学校/外援/外卡）；移出后队员仍在、赛季 UTR 仍在
- [x] 4.4 GREEN — 实现成员关系的加入与移出
- [x] 4.5 RED — 写入一条 `预填` 来源的赛季 UTR，再用总表值覆盖，来源变成 `组委会总表`
- [x] 4.6 GREEN — 实现赛季 UTR 的写入与来源流转
- [x] 4.7 RED — 未知队员/未知队伍返回 404；格式非法的载荷返回 4xx 而不是 500
- [x] 4.8 GREEN — 最小实现使两条断言通过
- [x] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - **STATUS: PASS** — attempt 1, scores: spec 100, runtime 100, code 98, total 99.6 ≥ 80

## 5. 合并、拆分、裁决与赛季锁

### Contract
- **Spec**:
  - 合并后两边的成员关系与赛季参赛 UTR SHALL 全部挂到同一个人名下；若同一赛季出现两个
    不同的参赛 UTR，系统 SHALL 标记为未裁决并保留两个值，MUST NOT 静默丢弃其中一个，
    也 MUST NOT 因此拒绝合并。
  - 拆分 SHALL 逐行指定每条赛季参赛 UTR 与每条成员关系归属哪一边；未被指定移出的记录
    SHALL 留在原队员名下。
  - 在裁决之前，任何读取该赛季参赛 UTR 的地方 SHALL 取较大的那个值，并 SHALL 能说明该值
    处于未裁决状态。裁决可以填两个候选之外的值，裁决后来源变成 `admin裁决`。
  - 赛季被锁定后，该赛季的参赛 UTR 修改、成员关系变更、以及队员删除 SHALL 被拒绝，
    且拒绝理由 SHALL 指明是赛季锁。删除队员 SHALL 仅在该队员没有任何属于已锁定赛季的
    记录时允许。
- **Runtime**: `cd backend && uv run pytest tests/test_players_merge.py` → expected: 全部通过，含合并保留全部关系、同赛季两值判未裁决、两值相同不算冲突、拆分逐行归属、未裁决读到较大值、裁决可填第三个值、赛季锁拒绝且理由指名
- **Code**:
  - 取大是有方向的选择（D3）：参赛 UTR 几乎全部用作上界判定，取小会把违规阵容显示成合法。
    代码注释要写明这个不对称，不得在任何地方暗示「取小更保守」。
  - 合并/拆分的行归属是纯函数，写入是 command 层；本次不做操作历史，因此不可撤销这件事
    要在 API 层面就说清楚（响应里带上「已发生什么」）。
  - 赛季锁的判定集中在一处，不得在每个写路径里各写一遍。
- **Threshold**: 80

- [x] 5.0 CONTRACT — write openspec/changes/player-management/contracts/group-5.md with the ### Contract block above
- [x] 5.1 RED — `tests/test_players_merge.py`：合并两名各有一条成员关系与一条赛季 UTR 的队员，合并后四条记录都在
- [x] 5.2 GREEN — 实现合并
- [x] 5.3 RED — 合并后同赛季 6.25 与 6.38 → 未裁决且两个值都可读、`value` 是 6.38；两边都是 6.38 → 不产生未裁决
- [x] 5.4 GREEN — 实现合并时的冲突标记
- [x] 5.5 RED — 拆分时勾选的记录跟新队员走、没勾的留下；拆分产生一名新队员
- [x] 5.6 GREEN — 实现拆分
- [x] 5.7 RED — 未裁决时读到较大值且带未裁决状态；裁决为 6.25 后读到 6.25、来源变 `admin裁决`；裁决可填 6.30
- [x] 5.8 GREEN — 实现裁决与取值规则
- [x] 5.9 RED — 锁定 2025 后改该赛季 UTR/成员关系/删人都被拒且理由指名赛季锁；2026 不受影响；有已锁赛季记录的队员不能删
- [x] 5.10 GREEN — 实现赛季锁（判定集中在一处）
- [x] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - **STATUS: PASS** — attempt 1, scores: spec 100, runtime 100, code 100, total 100 ≥ 80

## 6. 登录、会话与写入口

### Contract
- **Spec**:
  - 浏览器 SHALL 通过 Next 的登录页以口令换取会话，会话 SHALL 存在 httpOnly cookie 中。
    `BACKEND_SECRET` 与 `ADMIN_SECRET` MUST NOT 出现在客户端 bundle 里。口令 MUST NOT 以
    明文形式存储，SHALL 以哈希形式配置。
  - 会话 SHALL 有有效期，过期后写操作 SHALL 被拒绝并要求重新登录。连续登录失败 SHALL 被
    限速，且剩余尝试次数或解锁时间要呈现在界面上。
  - 未登录状态下触发写操作，客户端 SHALL 得到「需要登录」而不是一个通用错误。
- **Runtime**: `cd frontend && npm run test -- app/login lib/session` → expected: 全部通过，含口令正确下发 httpOnly cookie、错误口令不下发且回传剩余次数、会话过期后写被拒、未登录写操作得到需要登录
- **Code**:
  - 登录在 Next 侧，写操作走 Server Action：服务端校验 cookie 之后才带上两个密钥调
    FastAPI（D5）。浏览器只与 Next 通信这条纪律不变。
  - 限速用内存计数（按 IP + 固定窗口），**不引 Redis**；注释写明「Render 免费实例单进程」
    这个前提，多实例下这条会失效。
  - 不用 JWT：只有一个管理员、一个服务端消费者，JWT 的可验证性没有用武之地。
- **Threshold**: 80

- [x] 6.0 CONTRACT — write openspec/changes/player-management/contracts/group-6.md with the ### Contract block above
- [x] 6.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-29-player-management-mocks.html` 第 01 屏；记下 token 与逐字文案：「只有管理员可以修改队员数据」「口令」「登录」「口令不对」「还可以试 3 次」
- [x] 6.2 RED — `lib/session` 的纯逻辑：口令哈希比对、会话签发与过期判定；错误口令返回剩余次数
- [x] 6.3 GREEN — 实现会话签发与校验
- [x] 6.4 RED — 登录页：正确口令后 cookie 是 httpOnly；错误口令渲染失败原因与剩余次数
- [x] 6.5 GREEN — 实现登录页与 Server Action
- [x] 6.6 VISUAL DIFF — `npm run dev --prefix frontend`，访问登录页，对照 mocks 第 01 屏核对 token 与逐字文案（桌面 1440px）
- [x] 6.7 RED — 未登录触发一次写 Server Action 得到「需要登录」；会话过期后同样被拒
- [x] 6.8 GREEN — 实现写入口的会话校验
- [x] 6.9 RED — 断言客户端 bundle 不含 `BACKEND_SECRET` 与 `ADMIN_SECRET`（用 `npm run build` 产物扫描，
      即 config.yaml 里已有的那条 custom_verification_check，不另造一份单测）
- [x] 6.10 GREEN — 使断言通过（密钥只在服务端读取）
- [x] 6.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-6.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
  - attempt 1 **BLOCK**：限速按 `x-forwarded-for` 第一段计数，那是调用方能写的，轮换即绕过；另外 `BACKEND_SECRET` 缺失时发空 header（失败开放）。补测试后改成可信 header + 全局配额，两个密钥都改成失败关闭。
  - attempt 2 **STATUS: PASS** — scores: spec 100, runtime 100, code 90, total 98 ≥ 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

## 7. 队员列表与详情

### Contract
- **Spec**:
  - 队员列表 SHALL 呈现姓名、性别、当前单双打 UTR 与状态、参赛 UTR（含赛季与状态）、
    所在的全部队伍、以及 UTR 链接是否已填。一名队员同时属于多支队伍时 SHALL 全部列出。
  - `未裁决` 与 `预填` SHALL 用同一档警示样式标出。缺少 UTR 链接 SHALL 可见但 MUST NOT
    呈现为错误。
  - 队员详情页 SHALL 在同一屏内呈现基本信息、各赛季参赛 UTR、以及队伍成员关系；
    SHALL 说明外援与外卡的区别，并说明外援限制未被系统校验。
  - 呈现未裁决时，页面 SHALL 说明当前按较大值参与计算，并给出两个候选值。
- **Runtime**: `cd frontend && npm run test -- app/players` → expected: 全部通过，含一人多队全部列出、未裁决与预填带同档警示、详情三块同屏、未裁决横幅写明当前采用值
- **Code**:
  - 长列表要自带滚动容器，滚动放内层、表头留在外面（壳是 `h-screen overflow-hidden`，
    见 CLAUDE.md Pitfalls）。
  - 本 change 落地后到读路径切换之前，管理界面的修改在名单页与排阵页上看不见——界面上要
    说明这一点，不能让人以为前台坏了（Risks 第一条）。
  - 取数经 `frontend/lib/api.ts` 单一出口；客户端 bundle 不含后端地址与密钥。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

- [x] 7.0 CONTRACT — write openspec/changes/player-management/contracts/group-7.md with the ### Contract block above
- [x] 7.1 MOCK — 打开 mocks 第 02、03 屏；记下 token 与逐字文案：「未裁决」「预填」「已认证」「所在队伍」「各赛季参赛 UTR」「队伍成员关系」「外援限制未校验」
- [x] 7.2 RED — `lib/api.ts` 的取数函数：类型含队员、赛季 UTR（值/备选值/未裁决/来源）、成员关系
- [x] 7.3 GREEN — 实现取数函数
- [x] 7.4 RED — 列表页：一人多队时两支队都出现；未裁决与预填带同一档警示样式；无 UTR 链接可见但不是错误态
- [x] 7.5 GREEN — 实现列表页
- [x] 7.6 VISUAL DIFF — 对照 mocks 第 02 屏核对（桌面 1440px），用最长的一组数据并把窗口调矮，确认列表可滚到底、表头不跟着滚
- [x] 7.7 RED — 详情页：基本信息、各赛季参赛 UTR、成员关系三块同屏；外援与外卡的说明存在；未裁决横幅写明「按 6.38 计算」并给出两个候选值
- [x] 7.8 GREEN — 实现详情页
- [x] 7.9 VISUAL DIFF — 对照 mocks 第 03 屏核对（桌面 1440px）
- [ ] 7.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-7.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 8. 合并拆分界面、未裁决队列与侧栏

### Contract
- **Spec**:
  - 合并与拆分页 SHALL 在执行前呈现操作后的结果：拆分 SHALL 两侧同时显示各自最终拥有
    哪些记录；合并 SHALL 显示并集与将产生的冲突。两者 SHALL 明确标注不可撤销，且该警告
    SHALL 与「未裁决」那类提示在视觉上区分开。拆分界面 SHALL 显示每条记录的证据（UTR 链接）。
  - 未裁决队列 SHALL 允许选择任一候选值，也 SHALL 允许填入两个候选之外的值。批量操作
    MUST NOT 呈现为主按钮。每一行都显示两个候选值、各自来自哪支队伍、以及当前采用的那个。
  - 侧栏 SHALL 有一项「队员管理」指向管理界面，未登录时点击 SHALL 把用户带到登录页，
    MUST NOT 打开一个空的或点了没反应的管理界面。侧栏 SHALL 呈现登录态与登出入口。
- **Runtime**: `cd frontend && npm run test -- app/players app/[season]/[division]/Sidebar` → expected: 全部通过，含拆分两侧结果、不可撤销警告与未裁决提示样式不同、裁决可填第三个值、批量确认不是主按钮、侧栏「队员管理」是链接且未登录时导向登录页
- **Code**:
  - 不可撤销的警告用 danger 档，未裁决用 warning 档——同色会让人以为都只是「注意一下」。
  - 「全部按较大值确认」在视觉上弱于单条裁决：它把保守估计变成已确认的事实，不该长得像
    默认动作。
  - 侧栏加项要保持现有形状：已实现的是链接、未实现的是禁用态并标注未开放。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

- [ ] 8.0 CONTRACT — write openspec/changes/player-management/contracts/group-8.md with the ### Contract block above
- [ ] 8.1 MOCK — 打开 mocks 第 04、05 屏；记下逐字文案：「拆分不可撤销」「把哪些记录分出去」「留在原记录」「分出为新队员」「未裁决的参赛 UTR」「当前采用」「填别的」「全部按较大值确认」
- [ ] 8.2 RED — 拆分页：勾选后两侧各自显示最终拥有的记录；不可撤销警告的样式与未裁决提示不同；每行显示 UTR 链接作为证据
- [ ] 8.3 GREEN — 实现拆分页
- [ ] 8.4 RED — 合并页：执行前显示并集与将产生的冲突
- [ ] 8.5 GREEN — 实现合并页
- [ ] 8.6 VISUAL DIFF — 对照 mocks 第 04 屏核对（桌面 1440px）
- [ ] 8.7 RED — 未裁决队列：每行两个候选值与各自来源队伍、当前采用值；可填第三个值；批量确认不是主按钮
- [ ] 8.8 GREEN — 实现未裁决队列
- [ ] 8.9 VISUAL DIFF — 对照 mocks 第 05 屏核对（桌面 1440px）
- [ ] 8.10 RED — 侧栏：「队员管理」是链接、在管理界面时高亮；未登录时点击导向登录页；已登录时显示身份与登出，未登录时不显示
- [ ] 8.11 GREEN — 改 `Sidebar.tsx` 与 `ActiveSidebar.tsx`
- [ ] 8.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-8.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 9. 验证与上线

- [ ] 9.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 9.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 9.3 e2e 不适用（`project.e2e_command` 为空），跳过并在此注明
- [ ] 9.4 本地全流程演练：跑完 pytest 先 `bash backend/scripts/reseed-local.sh` 补回数据，再 `python -m app.players.migrate --check` 核对——队员数等于规范化姓名去重后的人数、未裁决数正好 17（CLAUDE.md Pitfalls）
- [ ] 9.5 远程迁移：Dashboard 手工执行 migration SQL；`DATABASE_URL` 指远程跑 `--check` 再执行；**跑完立刻 unset**——同窗口接着跑 pytest 会清空线上数据（CLAUDE.md Pitfalls）
- [ ] 9.6 Render 与 Vercel 各加环境变量（`ADMIN_SECRET`、管理员口令哈希），再部署
- [ ] 9.7 Run superpowers:verification-before-completion —— 跑 `project.test_commands` 与全部 `project.custom_verification_checks`
