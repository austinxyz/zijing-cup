---
Date: 2026-08-31
Change: mobile-shell
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-31-mobile-shell-requirements.md
---

## Why

所有页面都是桌面三栏（216px 侧栏 + 中间列 + 主体），壳是 `h-screen min-h-[640px]
overflow-hidden`。手机上打开会横向溢出，而 `overflow-hidden` 让溢出部分**不出现
滚动条** —— 看不出还有内容。而真实使用场景恰恰在手机上：比赛当天在场边看名单、
临时改阵容、临时补一个人的 UTR。在电脑前做的事（导名单、批量导 UTR、合并拆分队员）
已经有桌面版式了。

## What Changes

- **< 768px 时侧栏收成顶栏 + tab 条**，tab 四项：队伍 / 阵容 / 对手对比（禁用占位）/
  赛制规则。「队员管理」不上 tab 条 —— 管理界面本次不做手机版式。
- **球队列表与球队名单在手机上是两屏**（桌面仍并排两列）。同一套路由 + CSS 决定
  哪一列可见：服务端看不见视口，按设备拆路由只能靠 UA 嗅探。
- **名单行在手机上重排**：序号 · 姓名+性别 · 参赛 UTR + 来源标签。桌面那两列
  「当前单打 / 当前双打」不上手机。
- **排阵页在手机上以 Top-5 结果打底**，锁定/排除控件收成一个可展开的底部抽屉；
  收起时顶部一条摘要点名到人（不能做成「点开才知道有没有约束」）。
- **管理员的行内编辑在手机上保留**，形态从表格行里的 inputs 变成编辑抽屉。
- **UTR 官网链接**：有 `utr_profile_id` 的人可点开
  `https://app.utrsports.net/profiles/<id>`。这个字段存了很久却**全站没有一处是真
  链接**。三处一起加，手机与桌面都有：名单页姓名（新增元素）、队员详情页那行
  `…/profiles/{id}` 文字、队员列表那列的「有」。
- **修两个既有 token 的对比度**（画视觉稿逐节点量出来的，两处今天都在桌面上跑着）：
  `--color-muted` 在 `--color-surface-muted` 上 4.09 → 改 `--color-muted` 到
  #6b665d（4.97）；侧栏 `PendingNavItem` 带 `opacity-45`，合成后 **1.63** —— 去掉
  该 opacity 并把 `--color-sidebar-fg-dim` 改到 #8f8a7e（5.01）。

不含破坏性变更：没有 API 形状变化，没有数据库变更，桌面布局不动。

## Capabilities

### New Capabilities

无。本次不引入新能力，是给四个既有能力加一套手机版式并补一个一直缺的链接。

### Modified Capabilities

- `app-shell` —— 侧栏在手机上变形为顶栏 + tab 条；赛季×组别切换器随之移位；
  两个 token 的对比度修复。改的是它的**呈现要求**，导航语义不变。
- `team-roster-ui` —— 球队列表/名单在手机上的两屏钻取、名单行的字段取舍、
  名单页姓名的 UTR 链接。
- `lineup-ui` —— 排阵页在手机上的结果打底与约束抽屉，以及收起时的约束摘要要求。
- `player-admin-ui` —— 队员详情页与队员列表的 UTR 链接。**不做手机版式**，
  只加链接。

`competition-rules` 不列为 modified：规则页本来就是单列，手机上只是栅格压成一列，
没有新的行为要求。

## Impact

- `frontend/app/[season]/[division]/layout.tsx` —— 壳的高度模型（`100dvh`、
  去掉 `min-h-[640px]`）与横向布局的断点分支。
- `frontend/app/[season]/[division]/Sidebar.tsx` / `ActiveSidebar.tsx` ——
  同一份导航要同时出侧栏形态与顶栏 tab 形态；`PendingNavItem` 去 opacity。
- `frontend/app/[season]/[division]/teams/layout.tsx` / `SelectedTeamList.tsx` ——
  按当前 segment 决定手机上显示列表还是名单。
- `frontend/app/[season]/[division]/teams/[code]/RosterTable.tsx` /
  `RosterEditor.tsx` —— 名单行的手机形态、编辑抽屉、姓名链接。
- `frontend/app/[season]/[division]/lineup/[code]/` —— `LineupControls` 在手机上
  变抽屉，`page.tsx` 的两栏分支，新增约束摘要。
- `frontend/app/[season]/[division]/players/PlayerTable.tsx` /
  `players/[id]/page.tsx` —— 两处 UTR 链接。
- `frontend/app/globals.css` —— `--color-muted` 与 `--color-sidebar-fg-dim`
  两个值；波及桌面 ~76 处用到它们的地方（只变颜色，不变布局）。
- 新增一处 UTR 网址常量（单一出口），预计放在 `frontend/lib/`。
- **后端仅一处只读扩展**：`utr_profile_id` 早已在两个只读端点的响应里。名单端点
  （`get_team_roster`）**新增一个 `locked: bool`** —— 该赛季是否已冻结（`season_locks`
  表里有没有该年的行）。这是 apply 阶段发现的：手机行内编辑要按锁状态显示「保存会覆盖
  参赛 UTR」的说明，而锁状态存在 DB 却没被只读端点返回，前端拿不到；负责人拍板加这一个
  只读字段（原本的「不动后端」由此放宽为「只读、不写、无 migration」）。锁表已存在，
  **无 migration**。

## Out of Scope

- **冷启动加载态** —— 单独一个 change。它自带一个已知地雷（路由级 `loading.tsx`
  让 Next 在页面代码跑之前 flush 响应头，`notFound()` 因此设不了 404，且实测
  fallback 从没被替换过），与版式没有技术依赖，混在一起会让一次评审同时背两个风险。
- **管理界面的手机版式** —— 队员管理（列表 / 详情 / 未裁决 / 合并 / 拆分）与 UTR
  批量导入往返表照旧是桌面三栏，手机上打开要横向滚动。明确取舍，不是遗漏。后果：
  手机上没有任何入口能到达队员管理。
- **原生 App / PWA / 离线**。
- **桌面布局的任何改动** —— 行高、列数、列宽都不变。
- `utr-export-ingest`、`roster-import-rewrite`、`opponent-compare` 各自单列在
  `openspec/specs/README.md` 的路线图上。
