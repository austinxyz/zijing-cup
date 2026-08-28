---
Date: 2026-08-28
Change: roster-import
Status: REVIEWED
HAS_UI_SURFACE: no
---

# roster-import Requirements

把球队与球员名单建成 `(赛季, 组别)` 维度的数据，并提供一条从组委会 UTR 总表
导入的命令。这是 `roster-display` 与 `lineup-engine` 的共同前置。

已上线的 `competition-rules` 提供了规则侧（cap / buffer / 分值 / 资格阈值）；
本次补上被规则约束的对象——球队与球员，以及排阵唯一要用的数值：参赛 UTR。

数据来源是 2025 年的组委会总表（Google Sheets，hwang21st@gmail.com 所有、共享给
本项目负责人）。领域规则见 [docs/domain/rules.md](../../domain/rules.md)。

## Goals

- 建立 `(赛季, 组别)` 下的球队与名单模型：球队、球员名单条目、参赛 UTR 及其来源依据。
- 提供 CLI 导入命令，读取从总表导出的 CSV，幂等写入，并提供 `--check` 漂移检测
  ——与 `load_rules` 同一形状，同一套「解析 → 读库 → 比对 → 只写差异」。
- 名单条目默认是**该赛季该队的一行快照**，不追求跨赛季球员身份。
- 名单行可选携带 UTR profile ID。系统里没有「本队」这个概念（无 per-user 登录），
  所以这是任意一行都能填的字段；实践中只有自己那支队会去填，填了才谈得上跨赛季
  追踪与「去年 Rated override」。
- 参赛 UTR 的**评级类别**能在可判定时自动判定、不可判定时明确留空待人工，
  而不是猜一个值。
- 导入产出对账报告：哪些球队有排名无名单、哪些有名单无排名、哪些行无法解析。
- 提供只读端点：某赛季组别的球队列表、某支球队的名单。

## Non-Goals

- 前端页面。浏览球队与球员属于 `roster-display`。
- 阵容合法性校验与阵容搜索 —— 属于 `lineup-engine`。本次只存数据，不判任何阵容。
- UTR 的自动抓取或定时同步。参赛 UTR 是赛季冻结值，本次只从 CSV 导入。
- 赛后 UTR 变化（总表的「After Event」两个 tab）。那是赛后复盘数据，
  与赛前名单人数也对不上（同一队赛前 26 人、赛后 19 人）。
- 外援（Borrowed Player）名额校验。总表认不出谁是外援（见 Constraints）。
- 跨赛季球员身份的自动合并。除手工填入的 UTR profile ID 外，
  同名不做任何自动归并。
- 球队 TPI 与种子排位**不入库**。排阵用不上。但排名表可作为导入命令的**可选输入**
  用于对账（见 Success Criteria）——只读来比对，不落表。
- 任何名单的 HTTP 写入端点。

## Constraints

- **真实个人数据不得进入仓库。** 总表含真实校友姓名、性别、UTR。CSV 只存在于
  操作者本地或运行环境，**不提交 git**；测试一律使用虚构姓名。这与
  `competition-rules` 的 seed 相反——规则是公开文本，名单不是。
- 沿用既有架构铁律：所有表建在 `zijing_cup` schema，migration 是 schema 变更唯一
  来源；浏览器只连 Next.js；只有 FastAPI 碰数据库；敏感变量禁止带 `NEXT_PUBLIC_`。
- 名单只读对外：**不提供任何修改名单的 HTTP 端点**。本项目没有 per-user 登录，
  一个公开可写的名单入口意味着任何人都能覆盖全部球队名单。写入路径只有 CLI。
- **评级类别不能只由 `DUTR Status` 推出。** 映射关系（已与负责人确认）：
  - `Rated` → 第 1 类 已认证
  - `Projected` → 第 2 类 委员会审定
  - `Unrated` → 第 2 类**或**第 3 类，取决于该队员是否有 USTA 比赛历史
  总表的 `Notes` 列提供了部分判据（`Zijing Cup 2024 UTR` / `Captain Provided UTR`
  / `Captain Provided Self Rate USTA 4.0`），但不覆盖全部 `Unrated` 行。
  因此模型必须同时保留原始状态与可空的规则类别。
- **总表不自洽，导入器不得假设它自洽。** 2025 银组：5 支球队有种子排名却没有名单
  （`SJTU-XJTU`、`SYSU-UCLA-UCD`、`UCSD-ZJU-MU`、`USTC-CMU-HQU`、`USTC-USC-UCB`），
  2 支有名单却不在排名表（`JLU-UESTC`、`NYU-UMICH`）；赛后 tab 里又出现了赛前
  tab 没有的队。「这个赛季有哪些队」无法从任何单一 tab 推出。
- **总表含非名单行。** 合并单元格的脚注漏成了数据行，`Team` 列出现
  `Borrowed Player` 与 `Unrated/Projected/Appeal` 两个伪队名，内容是中文说明文字。
  导入器必须显式识别并跳过，而不是当成球队建进去。
  同类陷阱还有一个更隐蔽的：银组 `SJTU` 在赛前 tab 里只有 1 行，看起来是支
  只有一名球员的球队；实际它对应排名表里 SJTU 的备注 `8.02 Excluded (No Pair)`
  ——那一行是「被排除的那名球员」的记录，不是名单。行数异常的球队要在对账报告里
  点出来，让人去看，而不是当作事实导入。
- 总表没有 UTR profile ID，只有 `Last Name` / `First Name` 两列；姓名含别名噪音
  （`Xun (Ivan)`、`Sophia J`）。跨赛季、跨组别识别同一人只能靠姓名，
  按姓名比对时 2025 有 23 人同时出现在金银两组（规则允许一人两组）。
- 后端不新增运行时依赖（CSV 用标准库 `csv`）。

## Success Criteria

- migration 在干净库上执行后，名单相关的表全部位于 `zijing_cup` schema，
  `public` 未被写入任何对象。
- 导入 2025 赛季金组与银组的赛前名单后，精确落库：
  - 金组 **6 支球队 / 120 名球员**
  - 银组 **13 支球队 / 211 名球员**（名单分散在三个 tab：主 tab 11 队 + `THU-I` 19 人
    + `THU-II` 20 人）
  - `Borrowed Player` 与 `Unrated/Projected/Appeal` 两个伪队名**不出现**在球队表中
- 名单行的唯一键是 `(赛季, 组别, 球队, 姓, 名)`。已核对 2025 全部 331 行：
  同一支队内没有重名，因此该键成立。若将来出现同队重名，导入必须报错而不是
  静默覆盖——这是快照语义唯一会被悄悄破坏的地方。
- 评级类别的自动判定可由查询验证：`Rated` 行为「已认证」，`Projected` 行为
  「委员会审定」，`Unrated` 行的规则类别为 NULL（待人工判定）。
  2025 共 26 行 `Unrated`（金 9 / 银 17），其中 **25 行的 `Notes` 有值**
  （`Zijing Cup 2024 UTR` / `Captain Provided UTR` 等），只有 1 行毫无依据。
  也就是说人工判定是一次小规模过目，不是一项调查工作——前提是 `Notes` 被原样保留。
- 参赛 UTR（`Match UTR`）与其来源依据（`Notes` 原文）都被保留；
  取样窗口的五个每日 UTR 值也一并存下，作为该值如何得出的证据。
- 导入命令重复执行结果一致、不产生重复行；`--check` 在一致时退出码 0，
  CSV 改动后未导入则非零退出并指出差异所在的球队与球员。
- 导入产出对账报告，至少列出：跳过的非名单行、无法解析的行、
  以及（若同时提供了排名表）有排名无名单与有名单无排名的球队。
- 名单行可关联 UTR profile ID；未关联的行不受影响。同一 profile ID 在同一赛季
  同一组别内不得重复（规则允许一人同时参加金银两组，故只在组别内唯一）。
- `GET /api/seasons/{year}/divisions/{code}/teams` 返回球队列表；
  `GET /api/seasons/{year}/divisions/{code}/teams/{team}/roster` 返回名单；
  未知赛季、组别或球队返回 404 而非空列表。
- 应用路由表中不存在任何指向名单资源的写方法。
- 后端测试覆盖：导入幂等性、`--check` 漂移检测、伪队名跳过、
  评级类别判定的三条分支、端点的 200 与 404 路径。测试数据全部为虚构姓名。
- 仓库中不含任何真实球员数据（新增一条 verification check 扫描）。

## User Stories

- 作为队长，我想让系统里有全部球队的名单和参赛 UTR，这样排阵时能跟真实的对手比，
  而不是只能看自己队。
- 作为队长，我想知道某个球员的参赛 UTR 是怎么定出来的（当前 Rated 值？去年紫荆杯的
  值？队长提供？），这样 UTR 明显失真时我知道该不该提申诉。
- 作为队长，我想让本队球员关联到 UTR profile，这样能跨赛季看到 UTR 漂移，
  而不必每年手工重建一份表格。
- 作为开发者，我想让导入命令在总表不自洽时**说出来**，而不是默默导入一份残缺名单
  —— 少了五支球队的名单，排阵分析会看起来正常但结论是错的。
- 作为开发者，我想让名单只能通过 CLI 写入，这样在没有 per-user 登录的前提下，
  不存在任何人都能覆盖全部球队名单的入口。

## Open Questions

本次无阻塞问题。以下两条影响的是 `lineup-engine` 怎么**判**，而非本次怎么**存**，
已转记到 [docs/domain/rules.md](../../domain/rules.md) 的「待澄清」：

- 总表脚注把 `Unrated / Projected / Appeal` 三类一起标为「Captain Provided UTR：
  有出场限制，并有小组赛要求」，与「`Projected` 属第 2 类、不受第 3 类的
  ≤2 名约束」的说法冲突。若实际受限的是三类之和，只把 `Unrated` 当受限会放出
  组委会不认的阵容。
- `/ Appeal` 后缀是否改变评级类别，还是仅标记该值被人工调整过。

另有一条数据缺口，非问题而是事实，记录在此以免后续误以为能做：

- **总表无法识别外援。** 规则对外援有名额与每场上场人数限制（单校 3/2、
  两校 2/1、三校 0），但总表只有一个漏成数据行的脚注提到外援，没有逐人标记。
  除非另有数据源，`lineup-engine` 无法校验外援限制。

## Referenced Capabilities

- `ADD team-roster` —— 球队与球员名单的 `(赛季, 组别)` 模型、CSV 导入命令与对账
  报告、参赛 UTR 及其来源依据、UTR profile 关联、名单只读查询端点。
