## 1. 约束判定

### Contract
- **Spec**:
  - 系统 SHALL 把一套阵容的合法性判定为下列约束的合取，缺一不可：逐线 cap 加每线
    buffer；各线超出量之**和**不超过**全队** buffer 额度；搭档差距；三条男双线的
    参赛 UTR 之和非递增（相等不算违规）；高 UTR 的人数与线位；十人互不重复。
    系统 MUST NOT 逐线独立判定 buffer。cap、buffer 额度、差距上限与高 UTR 阈值
    MUST 全部来自 `competition-rules` 的数据，MUST NOT 写成代码常量。
  - 开放线 MUST NOT 参与 cap 校验，也 MUST NOT 消耗全队 buffer 预算；表达为「无上限」，
    MUST NOT 用一个很大的数字代替。
  - 高 UTR 限制 SHALL 同时校验人数上限与允许的线位。女队员打男队员位置时 SHALL 按
    男队员的限制判定。
  - 校验不合法阵容时，每一条违规都 SHALL 指明线位与差额。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_rules.py` → expected: 全部通过，含「逐线都在容差内但合计超预算」「男双相等不算违规」「开放线不占 buffer」「高 UTR 线位越界」四类边界
- **Code**:
  - 纯函数：输入是已读出的名单记录与规则值，不碰数据库。约束逻辑要能用虚构数据
    密集测试。
  - **全程 Decimal**。10.25 与 10.2 对 cap 是不同答案；任何一处退化成 float 都会在
    边界上给出错误判定且难以发现。必须有「恰好等于 cap」与「恰好等于 buffer 额度」
    的用例。
  - `restricted_to_lines` 可空：「不限线位」与「限定某几条线」两条路径都要走通。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — `tests/test_lineup_rules.py`：一对搭档超出该线 cap 时被判违规；恰好等于 cap 不违规
- [ ] 1.2 GREEN — `app/lineups/rules.py` 实现逐线 cap 判定，全程 Decimal
- [ ] 1.3 RED — 五线各超 0.2、全队额度 0.5 时判为违规，且违规指向全队 buffer 而非任何单线；单线超 0.3 而额度 0.5 时合法
- [ ] 1.4 GREEN — 实现全队 buffer 预算判定
- [ ] 1.5 RED — 搭档差距超限判违规；三条男双线非递增合法、相等合法、倒挂违规
- [ ] 1.6 GREEN — 实现差距与男双次序判定
- [ ] 1.7 RED — 开放线（cap 为 None）上任意强度的搭档都不产生 cap 违规、不占 buffer；但差距超限仍违规
- [ ] 1.8 GREEN — 实现开放线
- [ ] 1.9 RED — 高 UTR：人数超标违规；人数没超但线位不允许也违规；女队员打男双按男队员阈值判定；`restricted_to_lines` 为空时不限线位
- [ ] 1.10 GREEN — 实现高 UTR 的人数与线位判定
- [ ] 1.11 RED — 同一名队员出现在两条线时违规；每条违规都带线位与差额
- [ ] 1.12 GREEN — 实现重复用人判定与违规报告结构
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 搜索、去重与上限

### Contract
- **Spec**:
  - 系统 SHALL 接受锁定搭档与排除队员，在其余空间搜出合法阵容。所有结果 MUST 包含
    每一对锁定搭档，MUST NOT 包含任何被排除的队员。锁定本身不合法时 SHALL 报告
    该锁定不合法，而不是返回空结果。
  - 候选 SHALL 按上场十人参赛 UTR 之和从高到低排序，并按**上场十人的集合**去重：
    同一批十人换线 MUST NOT 计为两套。
  - 结果 SHALL 包含可达上限，以及有多少组不同的十人能达到它。未被截断的搜索所报的
    上限，MUST 没有任何合法阵容能超过。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_search.py` → expected: 全部通过，含锁定被遵守、排除被遵守、换线去重、上限确为上限、次序可复现
- **Code**:
  - 分支限界：按合法搭档数从少到多定线序（WD → MD → D3 → D2 → D1），以「剩余各线
    最强搭档之和」为上界剪枝。**精确穷举，不用启发式**——上限报告要求「没有任何合法
    阵容能超过这个数」，启发式给不出这个保证。
  - 并列极多（实测最多 400+ 套），相等时的次序取决于搜索顺序：**同样输入必须给出
    同样输出**，否则刷新一次候选就换一批。
  - 目标与金组 4:4 第二级抢先方向相反（那一级低者胜）。这是已知代价，代码注释要写明，
    不得在任何输出里暗示「顶满 cap 总是占优」。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — 无锁定无排除时，返回的每一套都通过 group 1 的全部约束
- [ ] 2.2 GREEN — `app/lineups/search.py` 实现分支限界搜索
- [ ] 2.3 RED — 候选按十人之和降序；两套十人相同仅换线的阵容只出现一套
- [ ] 2.4 GREEN — 实现排序与按十人集合去重
- [ ] 2.5 RED — 锁定某线后每套都含该对；排除某人后每套都不含该人；锁定一对本身超 cap 的搭档时报告该锁定不合法而非空结果
- [ ] 2.6 GREEN — 实现锁定与排除
- [ ] 2.7 RED — 报告的上限确为上限：在一份小名单上穷举全部合法阵容，最大值等于报告值
- [ ] 2.8 GREEN — 实现上限与「达到上限的十人组合数」
- [ ] 2.9 RED — 同一输入连续搜索两次，候选次序完全一致
- [ ] 2.10 GREEN — 使次序可复现（并列时有确定的次级比较）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 无解、截断与外援免责

### Contract
- **Spec**:
  - 搜索无解时 SHALL 报告无解并指出哪条线没有合法搭档。MUST NOT 用空结果列表表示
    无解。系统 MAY 一并给出相关队员当前的去向（读输入即可得到），
    MUST NOT 声称知道是哪一条锁定导致了无解。
  - 搜索 SHALL 有节点预算。触到预算时 MUST 报告结果不完整，MUST NOT 把截断的结果
    当作完整搜索呈现。
  - 系统 MUST NOT 校验外援限制，并 SHALL 在结果中明确标注该项未被校验。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_report.py` → expected: 全部通过，含无解指名线位、截断被声明、完整搜索不谎称截断、外援免责始终存在
- **Code**:
  - 无解与「候选为空」是两个不同的返回状态，不能靠列表长度区分——空列表读作
    「搜过了没有」，与「这套限制本身没有解」是不同的断言。
  - 截断标记必须来自搜索本身是否穷尽，不能事后猜。完整搜索谎称截断同样是错的。
  - 外援免责是无条件的：任何搜索或校验结果都带它。
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — 构造必然无解的锁定与排除（把女队员锁进别的线并排除其余，使 WD 无人可配），返回无解且指名 WD；返回值不是空候选列表
- [ ] 3.2 GREEN — 实现无解状态与线位诊断
- [ ] 3.3 RED — 节点预算设得极小时，结果标明不完整；预算充足时标明完整
- [ ] 3.4 GREEN — 实现节点预算与截断标记
- [ ] 3.5 RED — 任何搜索或校验结果都带外援未校验的标记
- [ ] 3.6 GREEN — 实现外援免责标记
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 只读端点

### Contract
- **Spec**:
  - 后端 SHALL 提供一个只读端点返回搜索结果，锁定与排除通过 query 参数传入。
    系统 MUST NOT 因此新增任何写方法。
  - 未知球队 SHALL 返回 404。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_api.py` → expected: 全部通过，含 query 锁定被遵守、未知球队 404、OpenAPI 中仍无写方法
- **Code**:
  - 「无写方法」的断言必须读 `app.openapi()["paths"]`，不能遍历 `app.routes`——当前
    FastAPI 版本把 `include_router` 存成单个不透明条目，遍历它看不见任何 `/api` 路由
    而静默通过。
  - 路由只负责读库、调纯函数、组装响应；约束与搜索逻辑不得下沉到路由里。
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — `tests/test_lineup_api.py`：请求某队的阵容搜索返回 200，含候选、上限、三种状态标记
- [ ] 4.2 GREEN — 新增只读路由，读规则与名单后调用搜索
- [ ] 4.3 RED — query 中的锁定与排除被遵守；格式非法的 query 返回 4xx 而不是 500
- [ ] 4.4 GREEN — 实现 query 解析与校验
- [ ] 4.5 RED — 未知球队 404；OpenAPI 中仍不存在任何 POST / PUT / PATCH / DELETE
- [ ] 4.6 GREEN — 最小实现使两条断言通过
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 排阵页：锁定、排除与结果

### Contract
- **Spec**:
  - 锁定的搭档与排除的队员 MUST 由 URL 表达，MUST NOT 只存在于客户端状态。
  - 结果区 SHALL 先呈现可达上限、规则允许的上限、两者差值，以及达到上限的十人组合数；
    之后才是候选列表。候选 MUST 已去重。
  - 每一套候选 SHALL 显示五条线各自的两名队员、**性别**、该线参赛 UTR 之和、超出量
    （若有），以及该套用掉的全队 buffer 与额度。
  - 当锁定或排除使可达上限下降，页面 SHALL 显式呈现这个差值。
  - 页面 MUST 在服务端取数，经 `frontend/lib/api.ts` 单一出口；客户端 bundle
    MUST NOT 包含后端地址或共享密钥。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含 URL 表达锁定与排除、上限与组合数呈现、候选显示性别、锁定代价可见
- **Code**:
  - 锁定与排除从 URL 读，不进 React state——存一份就会与地址栏分歧，刷新与分享都会丢。
  - 性别是必需列：高 UTR 限制分性别设定，不显示性别就无法据界面核对这条约束。
  - 长列表要有自带的滚动容器，滚动放在内层，表头留在外面（壳是 `h-screen
    overflow-hidden`，见 CLAUDE.md Pitfalls）。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

- [ ] 5.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-28-lineup-engine-mocks.html` 的前两节（`design/Lineup.dc.html`、`LineupLocked.dc.html`）；记下 token 与逐字文案：「本队可达上限」「规则允许」「交给引擎」「已锁」「本场不能上」「搜索阵容」
- [ ] 5.2 RED — `lib/api.ts` 的取数函数：类型含候选、上限、组合数、三种状态标记；锁定与排除编码进 query
- [ ] 5.3 GREEN — 实现取数函数
- [ ] 5.4 RED — 锁定控件：锁定一对后 URL 改变，直接访问该 URL 得到同一套锁定；排除同理
- [ ] 5.5 GREEN — 实现锁定与排除控件，状态来自 URL
- [ ] 5.6 RED — 结果区：先呈现可达上限、规则允许上限、差值、达到上限的十人组合数；候选显示五线搭档、性别、各线之和、超出量与 buffer 用量
- [ ] 5.7 GREEN — 实现结果区
- [ ] 5.8 RED — 锁定使上限下降时，页面呈现该差值
- [ ] 5.9 GREEN — 实现锁定代价的呈现
- [ ] 5.10 VISUAL DIFF — `npm run dev --prefix frontend`，访问排阵页，对照 `design/Lineup.dc.html` 与 `LineupLocked.dc.html` 核对 token、配色与逐字文案（桌面 1440px）；**用最长的一组数据并把窗口调矮**，确认候选列表可以滚到底、表头不随之滚走（CLAUDE.md Pitfalls）。移动端不在本 change 范围
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 三种非正常状态的呈现与侧栏

### Contract
- **Spec**:
  - **无解**、**搜索被截断**、**外援限制未校验** SHALL 各自在页面上有明确呈现，
    三者都 MUST NOT 以空列表或静默省略表达。
  - 无解的呈现 SHALL 指明哪条线凑不出，并与「搜索没找到」区分开。页面 MAY 呈现相关
    队员当前的去向，但 MUST 说明那是读取当前输入的结果，MUST NOT 呈现为因果归属。
  - 已实现的导航项 SHALL 是链接；导航项的名称 MUST 指向它实际打开的页面。排阵页叫
    「阵容」；「对手对比」单列并保持未开放态。
  - 取数失败时 MUST 只把内容区换成错误态，侧栏 MUST 仍然渲染。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含三种状态各自可见、无解不是空列表、侧栏「阵容」是链接而「对手对比」不是
- **Code**:
  - 无解与「候选为空」在界面上也必须是两种呈现，不能靠列表长度区分。
  - 「谁去了哪」旁边必须有那句区分说明，否则会被读成「是这条锁定导致的」。
  - 侧栏「分析」一项被「阵容」与「对手对比」取代——同名会让人以为已经能比对手了。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70

- [ ] 6.0 CONTRACT — write openspec/changes/lineup-engine/contracts/group-6.md with the ### Contract block above
- [ ] 6.1 MOCK — 打开 mocks 第三节（`design/LineupBlocked.dc.html`）；记下逐字文案：「凑不出合法阵容」「这不是「搜索没找到」」「各线还剩多少合法搭档」「外援限制未校验」「搜索被截断」
- [ ] 6.2 RED — 无解时页面呈现无解并指名线位，且不渲染空的候选列表
- [ ] 6.3 GREEN — 实现无解态
- [ ] 6.4 RED — 页面呈现相关队员去向时，同时呈现「这是当前输入的读数，不是哪条锁定该负责」
- [ ] 6.5 GREEN — 实现去向呈现与那句区分说明
- [ ] 6.6 RED — 截断时页面呈现搜索不完整；任何含候选的结果都呈现外援未校验
- [ ] 6.7 GREEN — 实现截断与外援免责的呈现
- [ ] 6.8 RED — 侧栏「阵容」是指向排阵页的链接且在排阵页高亮；「对手对比」是禁用态且不是链接
- [ ] 6.9 GREEN — 改 `Sidebar.tsx`
- [ ] 6.10 VISUAL DIFF — 访问一个必然无解的锁定组合，对照 `design/LineupBlocked.dc.html` 核对（桌面 1440px）
- [ ] 6.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-6.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 7. 验证与上线

- [ ] 7.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 7.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 7.3 e2e 不适用（`project.e2e_command` 为空），跳过并在此注明
- [ ] 7.4 用 2025 真实数据本地验一遍：对全部 24 支球队（金 6 + 银 18）各搜一次，全部返回结果或如实报告截断；记录最坏耗时。**跑完 pytest 需先 `bash backend/scripts/reseed-local.sh` 补回数据**（CLAUDE.md Pitfalls）
- [ ] 7.5 Run superpowers:verification-before-completion —— 跑 `project.test_commands` 与全部 `project.custom_verification_checks`
- [ ] 7.6 上线：`git push`（Render + Vercel 自动部署；本次无 migration、无 seed 导入）。**部署后在远程测一次最坏情况的实际耗时**，据此复核节点预算是否合适——开发机的数字不能代表 Render 免费实例
