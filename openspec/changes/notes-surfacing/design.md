## Context

`player-notes` 已上线：`zijing_cup.player_notes` 表 + 详情页右栏「评价」区，评价挂 player_id、跨赛季、
机密（canEdit gate）。取数 `getPlayerNotes(id)` 是**单球员**、非 ok 降级 `[]`。本 change 把评价只读展示到
排阵/对手对比/roster——这些界面一屏 10–16 名球员，需要**批量**取；且排阵 seat 与 roster/compare 行的
可用空间差别很大，展示密度不同。

## Goals / Non-Goals

**Goals:**
- 一个批量读端点 + 前端一次往返取整批。
- 两种密度共用一个时间线弹层：排阵 seat 单标记「评」；roster/compare 分类小标。
- 三处 canEdit 机密门；对手对比两侧都显示；取数失败降级。
- 纯只读、不碰引擎。

**Non-Goals:**
- 不改 `player-notes` 模型/写路径；不加表、无 migration。
- 不在这三处写评价；不做过滤/聚合/精确搭档匹配。

## Decisions

- **D1 批量读端点**：`app/routers/players.py` 加 `GET /api/players/notes`，query 参 `ids`（逗号分隔或重复
  参数皆可，服务端解析成 int 集合，去重、忽略非法项）。查询 `PlayerNote where player_id in ids
  order by player_id, created_at desc, id desc`，在 Python 侧按 player_id 分组成
  `dict[int, list[NoteOut]]`，**只放有评价的 id**（无评价的 id 不进 map）。空 ids → `{}`。复用现有
  `_note_out`。读操作，靠 backend-secret 中间件自动保护（不需 admin）。给 ids 数量一个上限（如 ≤ 200）
  防滥用。
- **D2 前端 api**：`lib/api.ts` 加 `getPlayerNotesBatch(ids: number[]): Promise<Record<number, PlayerNote[]>>`
  ——空数组直接返回 `{}` 不发请求；**非 ok 或抛错一律降级 `{}`**（与 `getPlayerNotes`/`getTeamPresets`
  同款，远程/网络问题不打崩宿主页）。复用已有的 `PlayerNote` 类型。
- **D3 seat 带 player_id**：排阵/对手对比的 seat 数据经 `LineupCandidate`/`LineupPlayer`，前端只有 `key`
  （`{PREFIX}{player.id}`）。给后端 lineup 查询把 `player.id` 一并带出到响应，`LineupPlayer`（及候选 seat）
  与前端 `LineSeat` 各加一个 `player_id: number` 字段。`RosterPlayer` 已有 `player_id`，不动。
  （不在前端剥 key 前缀——显式字段更干净、类型安全。）
- **D4 共用弹层 `NotesPopover`**（client）：入参 `notes: PlayerNote[]` + 触发方式，渲染倒序时间线（类别
  中文标签 + 文本 + 时间），**只读**、无写控件。触发：桌面 hover **和** click 都打开、移动 click 打开
  （用一个受控 open state + 触发元素是 `<button>` 保证键盘/触屏可达）。弹层 `max-height` + `overflow:auto`
  不撑破 `h-screen overflow-hidden` 壳。类别→中文/颜色 token 与详情页 `NotesSection` 共用一份常量
  （抽到共享模块，避免三处 + 详情页四份漂移）。
- **D5 `PlayerNotesBadges`**（client，roster/compare 用）：入参 `notes: PlayerNote[]`；按出现的类别渲染
  彩色 pill（优点 success / 弱点 warning / 搭档 蓝 / 其他 muted）+ 该类条数；触发 `NotesPopover`。
  `notes` 空则渲染 `null`（不占位）。
- **D6 seat 单标记「评」**：`LineBlock` 的 seat 加一个可选 `notes?: PlayerNote[]`；有则在既有 外/▲/估
  标记序列里加一个「评」（含 `category==="weakness"` 用警示色、否则中性色），触发 `NotesPopover`；无则不加。
  改这一处，候选卡与已存阵容同时生效。`LineSeat` 增 `player_id` 供上游填 notes（或直接传 `notes`）。
- **D7 接线（各页仅 canEdit 时取数）**：
  - 排阵页 `lineup/[code]/page.tsx`：`canEdit` 时收集候选 + 已存阵容涉及的全部 player_id，
    `getPlayerNotesBatch` 一次取，构造 `Record<id, PlayerNote[]>` 传进渲染候选/已存的组件 → `LineBlock` seat。
  - 对手对比 `compare/page.tsx`：`canEdit` 时收集两队 lineup 涉及的 player_id 批量取，两侧行都传入。
  - roster `teams/[code]/page.tsx`：`canEdit` 时按名单 player_id 批量取，传给 `RosterTable` 行。
  - 未解锁：不取、传 `null`/空，组件不渲染任何标记。
- **D8 弱点信号统一用警示色**（warning family），优点用正色（success），三处 + seat 一致；对比度 ≥ 4.5:1，
  容器显式给底色（见 CLAUDE.md 硬编码颜色/继承底色坑）。

## Risks / Trade-offs

- **一屏多球员多弹层** → 弹层内容 lazy（打开才渲染时间线 DOM），标记本身极轻；一次批量取覆盖全屏。
- **hover 弹层在滚动容器里定位/裁剪** → 用简单的相对定位 + 受控 open，必要时 click 兜底；不引第三方
  popover 库。移动端一律 click。
- **给 lineup 响应加 player_id 会动到 seat 类型与若干 fixture** → 附加字段（可选/必填择一），tsc 会红出
  所有漏改的测试 fixture，按红点补齐（`npm run test` 不做类型检查，必须跑 `tsc --noEmit`）。
- **批量端点滥用**（超大 ids）→ 服务端 clamp ids 数量上限。
- **机密**：门在页面 fetch 决策（server component 仅 canEdit 取）；端点本身只要 backend-secret——与
  详情页 `getPlayerNotes` 同模型（机密由「前端何时取」保证，不是端点鉴权），保持一致不另立机制。

## Migration Plan

无数据库变更、无 migration、无部署前置。纯新增读端点 + 前端展示；后端读端点在旧前端下也无害（没人调）。
push 后端与前端即可，不需要先跑远程 SQL。

## Open Questions

无（explore/mock 阶段已定：hover+click 触发、移动 click；小标彩色 pill + 条数；seat 单标记「评」含弱点
警示色；对手对比两侧都显；批量端点 by-ids）。
