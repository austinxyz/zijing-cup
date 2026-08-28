## Context

`team-roster` 已经把 2025 赛季的名单落库并由两条只读端点提供（金组 6 队
120 人、银组 18 队 339 人，远程库已核对）。`app-shell` 已经定型了侧栏、
赛季×组别切换器与设计 token，`competition-rules` 页面是它们的第一个使用者。

缺的是消费方：侧栏里的「队伍」至今是 `PendingNavItem`，队长要看名单还是回
Google Sheet 翻。本次补上这一页，并顺带补一个纯粹是可读性问题的字段——
球队现在只有 `USTC-CMU-HQU` 这样的 code。

视觉稿：`design/Teams*.dc.html`（画布第三页）与
`docs/superpowers/specs/mocks/2026-08-28-roster-display-mocks.html`。

## Goals / Non-Goals

**Goals:**

- 两条路由 + 常驻球队列 + 名单表，选中球队由 URL 表达。
- 球队列显示人数与性别构成；名单表显示姓名、性别、参赛 UTR、UTR 来源。
- 评级类别为空时呈现「待定」，绝不呈现为某个具体类别。
- 球队可有一个人工维护的中文显示名，走 seed 文件，名单导入器不碰。
- 移动端两屏可用，命中区 ≥44px。

**Non-Goals:**

- 当前 UTR（无数据源）、阵容推荐（`lineup-engine`）、外援列（字段全空）、
  五日取样明细、界面编辑、搜索筛选排序。
- 不重新选设计系统：沿用 `app-shell` 已定的 token 与基础组件。

## Decisions

### 性别人数在后端算，不在前端算

球队列表要显示男/女人数。可以让前端为每支队各取一次名单再数，也可以让
`list_teams` 在已有的分组查询上多带一组计数。选后者：18 支队意味着 18 次
额外往返，而后端已经有一条 `group_by(Team.code)` 的聚合查询，多一个
`gender` 维度不增加查询次数。

计数分三档：男、女、性别未填。第三档不是防御性冗余——`gender` 是可空列，
把空值并进任一侧会让那一侧的人数凭空多一个人，而人数正是这一列存在的理由
（场上至少 3 名女队员）。2025 全部 459 行都有性别，所以第三档现在恒为 0；
它的作用是在将来出现空值时不出错，而不是现在显示什么。

### 排序只在后端做一次

`get_team_roster` 已经按 `match_utr desc, last_name` 返回。前端直接渲染这个
顺序，不再排一次。两处各排一次，在参赛 UTR 相同时会给出不同的先后——而
UTR 打平在这份数据里很常见（多人压在同一个 cap 上）。

### 显示名是球队的属性，不是前端的常量表

可以把 code→中文名的映射写成前端的一个常量对象，省掉 migration。不选：
那样这份数据既不在数据库也不在 seed，改名要发版；而它本质上是球队的一个
属性，将来 `lineup-engine` 生成的阵容表、导出的对阵单都会需要它。放进
`zijing_cup.teams` 加一列 `display_name text`（可空），由 seed 导入。

seed 形态沿用 `load_rules`：TOML 文件 + 「解析 → 读库 → 比对 → 只写差异」
+ `--check` 复用同一个比对函数。**从 seed 中消失的条目按清空处理**——否则
seed 就成了只增不减的叠加，不再是事实来源，这条与规则 seed 的语义一致。

### 显示名进入「导入器不碰」的字段集合

`roster-import` 已经建立了字段归属纪律：`load.py` 的 `SOURCE_FIELDS` 列出
CSV 拥有的字段，其余一概不写。`display_name` 是第四个人工维护字段（前三个
是外援标记、`utr_profile_id`、人工回填的评级类别）。名单导入器会 upsert
`teams` 行，必须显式只写 code 及其归属，不得把 `display_name` 一并重置。
这一条要有测试锁住——它正是快照式导入最容易悄悄破坏的地方。

### 路由布局：列表在 layout，名单在 page

`teams/layout.tsx` 承载球队列（它在两条路由下都在），`teams/page.tsx` 是
空状态，`teams/[code]/page.tsx` 是名单。这样切换球队时球队列不重新挂载，
且 `teams/[code]/error.tsx` 失败时替换的只是名单区，球队列与侧栏都还在——
与 `app-shell` 把壳放在 layout 的理由相同。

空状态不重定向到第一支球队。重定向会让地址栏自己变，而「第一支」是任意的
（字母序下是 `BUAA-UMN-UCB`），读起来像系统替用户选了一支队。

### 移动端名单用行卡片而非表格

390px 放不下五列表格：要么横向溢出，要么把参赛 UTR 压到看不清——而 UTR 是
整页存在的理由。改成每行 56px 的卡片：姓名+性别一行，UTR 来源一行，参赛
UTR 靠右大字。球队列表同样 56px 行。

### 「待定」用 warning 档，性别偏少只加字重

两者都是「注意但不是错误」。同一屏用同一种颜色会分不清指什么，所以颜色
（`--color-warning`）只留给「待定」——它是一件待办事项。女队员数 <4 的球队
只把那个数字加重：它完全合法，只是没有余量，用状态色会读作有问题。

## Risks / Trade-offs

- **[migration 必须手工执行]** → 加 `display_name` 是一个新 migration，而
  远程 Supabase 是与 ai-course-management 共享的项目，禁止 `db push` /
  `migration repair`。上线步骤必须显式包含「去 Dashboard SQL Editor 执行」
  这一步，否则前端上线后这一列查不到。列可空且无默认值，所以先上代码后跑
  migration 只会让显示名为空，不会 500——但反过来说，忘了跑也不会报错，
  只会静默地一个中文名都没有。

- **[给 `teams` 加列会碰到名单导入路径]** → 名单导入会 upsert `teams` 行。
  写错就会在每次导入名单时把所有显示名清空，而且不报错。缓解：字段归属测试
  用「先设显示名 → 导一份有差异的 CSV → 断言显示名还在」的形态，而不是
  导一份无差异的 CSV（那样导入器根本不写，测试会空转——`roster-import` 的
  五个字段归属测试里有三个曾经因此是假通过的）。

- **[球队列表多带一组聚合]** → `list_teams` 的查询从「按 code 计数」变成
  「按 code × gender 计数」再在应用层合并。行数最多 18×3，不影响。但要
  保持一次查询，不要退化成先查球队再逐队查性别。

- **[18 行球队列在桌面一屏]** → 18 行 × 46px + 表头约 888px，1440×980 的
  视口放得下；金组 6 行更宽松。将来球队数增长会需要滚动，届时是列本身滚动，
  不是整页滚动。

- **[seed 指向不存在的球队]** → 球队是名单导入创建的。seed 里写了一个还没
  导入名单的球队 code，就匹配不上。按「报告未匹配条目」处理而不是静默忽略，
  也不是报错退出——顺序上先导名单再导显示名是正常流程，但拼错 code 必须
  被看见。

## Migration Plan

1. 本地：`supabase db reset` 应用新 migration，跑测试。
2. 远程：把 migration 文件的 SQL **手工贴进 Supabase Dashboard 的
   SQL Editor 执行**。禁止 `supabase db push` / `migration repair`——
   CLI 的 migration 追踪表是整个 Supabase 项目共用的，repair 会把
   ai-course-management 的 migration 标记成 reverted，可能搞坏它的部署流程。
3. `git push` → Render 部署后端、Vercel 部署前端。
4. 远程执行球队显示名的 seed 导入（`DATABASE_URL` 指向远程），
   完成后**立即清除该环境变量**——同一窗口接着跑 pytest 会 TRUNCATE 线上表。
5. 复核：远程查一次球队列表，确认显示名与人数分布。

回滚：`display_name` 可空，前端对空值已有分支。若需回退，前端回滚即可，
数据库列留着不影响任何现有行为；不必回滚 DDL。

## Open Questions

无。视觉层面三处待定（18 行球队列的一屏观感、空状态措辞、「待定」标签配色）
已在视觉稿阶段定稿，见 `design/Teams*.dc.html`。
