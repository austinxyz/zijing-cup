## Context

队员管理页现状：`app/[season]/[division]/players/page.tsx` 单栏列表 + 单一 `q` 搜索；详情在独立
路由 `players/[id]/page.tsx`；`merge`/`split` 是 `[id]` 的子路由。`players/layout.tsx` 把整个板块
gate 在 `canEdit(season, division)` 上——未解锁重定向到队伍页。后端 `app/players/query.py` 的
`_filtered` 支持 `q`（姓名/UTR链接 ilike）、`season_year`、`team_id`、`unresolved_only`。

scoped-admin-auth 已就绪：`canEdit(season,division)`、`EditModeToggle`（就地解锁）、`adminWrite`
按比赛 scope 判权。本 change 复用这套，不新增鉴权。

## Goals / Non-Goals

**Goals:**
- 队员页改查看/编辑双模式，查看任人可读、编辑 gate。
- 左搜索（姓名/性别/队伍模糊/年份）右详情双栏，选中就地更新。
- 后端 `list_players`/`count_players` 加 `gender`/`team`(模糊)/`year`(任一) 筛选。

**Non-Goals:**
- 队伍页加/移出队员（另一 change）。右栏成员关系只读。
- 不改数据模型、无 migration、不动鉴权与参赛 UTR 语义。

## Decisions

### D1 — 主-详情用 URL searchParams（`?sel=<id>`），不做客户端 state
页面 server component 读 `searchParams`：搜索条件（`q`/`gender`/`team`/`year`）驱动左栏
`list_players`，`sel` 驱动右栏 `getPlayer(sel)`。左栏行是 `<Link href="?...&sel=<id>">`（软导航、
保留当前搜索条件）；搜索是 `<form method=get>`（全导航），**表单不含 `sel` 隐藏字段**，故一次新
搜索自然清空选中。
- *备选*：客户端 useState 选中 + fetch 详情。否——URL 可分享、刷新保持、与全站「状态在 URL」一致。
- **坑**：软导航复用 DOM，右栏详情/非受控输入按 `sel` 加 `key` remount，避免显示上一个人的陈旧值。

### D2 — 详情内容抽成 `PlayerDetail`，`[id]` 路由保留
把现 `players/[id]/page.tsx` 的详情渲染抽成 `PlayerDetail`（纯展示 + 编辑动作），右栏（index 页
`?sel`）与 `[id]` 路由都用它。`[id]` 路由保留作深链父级，`merge`/`split` 仍是其子路由；右栏的
「合并/拆分」按钮链接到 `/players/[id]/merge`、`/split`（不可逆操作留在带完整确认的子页）。
- *备选*：把 merge/split 改成右栏抽屉。否——不可逆操作的后果对照放子页更稳，改动也小。

### D3 — 查看/编辑模式：复用 EditModeToggle + 新 PlayerEditContext，默认查看
新增 `PlayerEditHeaderControl`（镜像 `TeamEditHeaderControl`）：未 `canEdit` → `EditModeToggle`
就地解锁（带 season/division）；`canEdit` → 「编辑模式/查看模式」开关 + 登出。客户端
`PlayerEditContext` 持 `{canEdit, editing, setEditing}`，右栏据 `editing` 显隐写控件。
**默认 `editing=false`（查看）**，即便 canEdit——本页有合并/拆分等不可逆动作，默认只读更稳
（与阵容页默认 editing=true 不同，是有意的：破坏性更高）。
- `players/layout.tsx` **去掉 canEdit 重定向**，改为纯 pass-through（或删除）。查看任人可读。

### D4 — 后端筛选扩展（`_filtered` 加三参数）
`_filtered(statement, q, season_year, team_id, unresolved, gender, team, year)`：
- `gender`：`where(Player.gender == gender)`。
- `team`（模糊）：join membership+Team，`where(Team.code.ilike(%t%) | Team.display_name.ilike(%t%))`。
- `year`（任一）：`where(Player.id.in_(select PlayerSeasonUtr.player_id where season_year==year)
  | Player.id.in_(select membership.player_id join Team where Team.season_year==year))`。
  用 id.in_ 两个子查询的 OR，避免与 team 的 join 相互污染（team join 是 INNER，直接加 year 到同一
  join 会变成「该队且该年」而非「任一」）。
- 现有 `season_year`（名单年，INNER join）保留；`year` 是新的「任一」维度，二者并存。
- `list_players` 去重仍按 id（多队/多来源会命中多行）。`count_players` 走同一 `_filtered`。
- 路由 `routers/players.py` 列表加 `gender`/`team`/`year` Query 参数透传。
- `lib/api.ts` `PlayerFilters`/`PlayerPageFilters` 加 `gender?`/`team?`/`year?`，`getPlayers`/
  `getPlayersPage` 拼进 query string。

### D5 — 左栏结果行精简 + 年份下拉取自 seasons
行只显示 姓名·性别·最新参赛UTR·所在队伍（多队「最新一支 +N」）。最新参赛UTR = `season_utrs[0]`
（后端已按年降序）；若筛了 `year`，显示该年的值。年份下拉选项来自 seasons 列表（侧栏同源）。
性别下拉提交值待 apply 核对 `Player.gender` 实际值域（`M/F` vs 中文）。

## Risks / Trade-offs

- [去掉 layout gate 后队员数据公开可读] → 有意：与名单/阵容页一致（同样的人 + UTR 本就公开）；
  写仍双重 gate（adminWrite 按比赛 scope + 查看模式隐控件）。
- [`?sel` 软导航复用 DOM 显示陈旧详情] → 按 `sel` key remount 右栏（既有 pitfall）。
- [`year` 任一 与 `team` 模糊同时用时 join/子查询交叉] → year 用 id.in_ 子查询 OR，与 team 的 join
  解耦；加组合筛选的单测。
- [gender 值域猜错导致性别筛选永远空] → apply 时先 `curl`/查库确认 `Player.gender` 取值，再定下拉值。
- [详情抽成 PlayerDetail 时把 server-only 逻辑带进客户端] → PlayerDetail 保持 server component，
  只把「编辑动作按钮」作为已绑定 server action + `canEdit` 数据传入客户端子组件（render-prop 不能
  跨 server→client 边界，既有 pitfall）。

## Migration Plan

无 migration、无新表。纯前端 + 后端查询扩展。Vercel + Render 各自部署即可；后端筛选参数是新增、
向后兼容（旧前端不传即旧行为）。回滚 = revert 提交。

## Open Questions

（explore 阶段已定默认，apply 时仅需核对 `Player.gender` 实际值域——非阻塞，见 D5。）
