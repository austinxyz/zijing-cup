## Context

对称 `player-notes`（刚上线）：那是 `player_notes` 表 + 批量读 + 详情页/overlay 时间线。本 change 把同一套
搬到 `saved_lineups`：`lineup_comments` 表 + GET/POST/DELETE + 批量读，UI 是已存阵容卡片内的可展开评论区。
已存阵容只在 `canEdit` 时取数渲染（`SavedLineups` 只在 admin 页出现），所以评论的机密门是现成的。写路径复用
`adminWrite`；写鉴权靠方法判权中间件自动生效。

## Goals / Non-Goals

**Goals:** lineup_comments 表 + 端点（含批量）；卡片内可展开评论区（编辑态追加/删除、查看只读）；机密随阵容；
克隆不带评论、删级联；失败降级。
**Non-Goals:** 候选评论；就地编辑；分类/评分；跨阵容聚合。

## Decisions

- **D1 模型/表**：`LineupComment`（`id`、`saved_lineup_id` FK→`saved_lineups.id` `ondelete=CASCADE`、`body`、
  `created_at` `sa_column=Column(DateTime(tz),server_default=func.now(),nullable=False)`）。migration 以
  `set search_path to zijing_cup, public;` 开头、`body` 长度 CHECK(1..2000)、`(saved_lineup_id, created_at desc)`
  索引。注册进 `models/__init__` + main。**对齐 player_notes migration 的写法**（含本地按整份文件一次 execute、
  别按 `;` 切句——见 CLAUDE.md）。
- **D2 端点**（挂 `routers/lineups.py`，路径在 `_SAVED` 家族下）：`GET/POST/DELETE
  …/saved-lineups/{id}/comments` + 批量 `GET …/lineup-comments?ids=…`。批量路由声明**在**任何 `/{id}` 之前，
  避免被路径参数吃掉（player-notes 的 `/notes` 前置教训）。`CommentIn` 用 `body: Field(min_length=1,
  max_length=2000)` + trim 校验（空白拒 422）。ids 解析去重/忽略非法/clamp≤200。
- **D3 前端 api**：`lib/api.ts` 加 `LineupComment`（`{id, body, created_at}`）+ `getLineupCommentsBatch(ids):
  Record<number, LineupComment[]>`（空→`{}`不请求、非 ok/异常→`{}`降级）。
- **D4 server actions**：`addLineupComment(season,division,savedLineupId,body)`（POST，trim，空则 no-op）/
  `deleteLineupComment(season,division,savedLineupId,commentId)`（DELETE），经 `adminWrite` scope
  `{season,division}`、成功 `revalidatePath(..., "layout")`。
- **D5 UI**：`SavedLineups` 卡片底部一个可展开评论区（本地 `useState` 折叠/展开；折叠显示「评论 N」计数）。
  展开：倒序时间线（body + `formatWhen` + 删除）+ 追加框。**追加/删除 gate = `useLineupEdit` 的
  `canEdit && editing`**（与卡片其它写控件一致），查看模式只读。用**卡片内可展开区、不是 body-portal 弹层**——
  躲开触屏 hover 弹层坑（CLAUDE.md）；删除就地确认、写失败就地报错、成功靠 revalidate。可复用 `notesDisplay`
  的 `formatWhen` 与就地确认删除的写法（不强绑 NotesPopover）。
- **D6 数据流**：排阵页 `page.tsx`/saved 页在 `canEdit` 时按本屏 saved_lineup id 批量取评论、构造
  `Record<id, LineupComment[]>` 传进 `SavedLineups`；未解锁不取。克隆走后端既有 clone（逐字节复制
  assignment/snapshot，不碰评论表）→ 天然空评论，无需额外代码。

## Risks / Trade-offs

- **[远程 migration 滞后]** → `getLineupCommentsBatch` 非 ok 降级 `{}`；push 前远程 Dashboard 先建表，否则
  追加/删除 500（读降级、排阵页不 500）。这是带 migration change 的既定前置。
- **[路由被 `/{id}` 吃掉]** → 批量 `…/lineup-comments` 与 `/{id}/comments` 的声明顺序；加“路由确实注册”断言。
- **[NOT NULL + server_default 发 NULL]** → `created_at` 用 `sa_column`（见 CLAUDE.md）。
- **[卡片变胖/移动端]** → 评论区默认折叠；展开区自带滚动上限；移动端全宽（mock 已含）。
- **[单测测不出布局/机密]** → 端点/降级/gate 有单测；真机 e2e 补充（追加+删除+查看只读+克隆空评论+未解锁不取）。

## Migration Plan

新表 `lineup_comments`。本地：把 migration 文件整份一次 `execute` 打到本地栈（断言 `127.0.0.1`）。
远程共享 Supabase：**push 读新表的后端前**，去 Dashboard SQL Editor 手工执行该 migration；否则线上追加/删除
500（读已降级为空、排阵页不崩）。migration 文件仍是唯一来源。

## Open Questions

无（评论区默认折叠、长度 2000、批量 by ids 已定）。断点细节在 apply 的 MOCK/VISUAL DIFF 收口。
