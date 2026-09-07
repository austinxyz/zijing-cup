## Context

球员详情在 `player-admin-workbench` 的 `PlayerDetail`（server 组件，右栏；工作台 `?sel` 与 `[id]` 深链
共用）。写经 `lib/admin.ts` 的 `adminWrite`（按比赛 scope 判权）；取数经 `lib/api.ts`。机密只读旁支的
既定做法：只在 `canEdit` 时 fetch（不进非管理员 HTML）、取数失败降级为空（不拖垮宿主页）。后端中间件
按 **HTTP 方法**判权（写自动要 `X-Admin-Secret`）。远程共享 Supabase 的 migration 走 Dashboard 手工。

## Goals / Non-Goals

**Goals:** 新表 `player_notes` + GET/POST/DELETE + 详情右栏「评价」区（分类追加式时间线、机密、只追加+删）。

**Non-Goals:** 就地编辑、结构化搭档、作者归属、检索/聚合、评分；不改球员既有模型。

## Decisions

### D1 — 后端 model / router
`PlayerNote`（`app/models/`，表 `player_notes`，`zijing_cup` schema）：`id` PK；`player_id` FK
`players.id`；`category str`；`body str`；`created_at` —— **必须** `sa_column=Column(DateTime(timezone=True),
server_default=func.now(), nullable=False)`，不要写 `Optional[datetime]=None`（会发显式 NULL 触发
NotNullViolation，见 CLAUDE.md）。router：GET（`order_by(created_at.desc())`）、POST（校验 body 非空
→ NotFound 若球员不存在）、DELETE（按 (player_id, note_id) 定位，不存在 404）。注册进 `main.py` +
`models/__init__.py`。category 的合法集合在 DB check 约束里管（应用侧也可校验，但约束是底线）。

### D2 — migration
`supabase/migrations/<ts>_create_player_notes.sql`：以 `set search_path to zijing_cup, public;` 开头，
`create table player_notes(id bigint generated always as identity primary key, player_id bigint not null
references players(id), category text not null check (category in ('strength','weakness','partner',
'other')), body text not null, created_at timestamptz not null default now())`。本地用签名解释器把该
SQL 打到本地栈（先断言连接串含 `127.0.0.1`）。**push 前远程 Dashboard 必须先执行**，否则读该表的后端
一部署即 500。

### D3 — api 层
`PlayerNote` 类型：`{ id:number; category: "strength"|"weakness"|"partner"|"other"; body:string;
created_at:string }`（literal union，后端漂移红 tsc）。`getPlayerNotes(season,division,playerId)` →
`GET /api/players/{id}/notes`，**非 ok 返回 `[]`（降级）**——远程 migration 手工执行有滞后窗口，缺表
不该把详情页打成 500（同 getSavedLineups/getTeamPresets 的只读降级）。

### D4 — server actions
`addPlayerNote(season,division,playerId,{category,body})` → `adminWrite("POST",
"/api/players/{id}/notes",{category,body:body.trim()},{season,division})`；空 body 前端就挡（按钮
disabled）+ 后端也拒。`deletePlayerNote(season,division,playerId,noteId)` → `adminWrite("DELETE",
"/api/players/{id}/notes/{noteId}",undefined,{season,division})`。均 `revalidatePath` 队员页。

### D5 — 详情右栏「评价」区（机密门）
`PlayerDetail` 加 `notes: PlayerNote[] | null` prop：`null` = 未解锁（不渲染评价区、页面不 fetch）；数组
= 已解锁（渲染）。工作台 `page.tsx` 与 `[id]/page.tsx`：`const notes = canEdit ? await getPlayerNotes(...)
: null`，与现有 canEdit 计算并发。`NotesSection`（client）收 notes + 绑好的 add/delete server action +
season/division/playerId：渲染时间线（倒序，类别中文标签 + 文本 + 时间）+ 追加表单 + 每条删除（就地确认）。
写控件（表单 + 删除）包在 `EditOnly` 内（`canEdit && editing`），故 admin 查看模式能看时间线、编辑模式
才出写入口。删除/追加 try/catch、后端 detail 就地显示、成功靠 `revalidatePath`/RSC 重渲染刷新（不拼本地
陈旧态）。

### D6 — key→label
`strength→优点 / weakness→弱点 / partner→适合搭档 / other→其他`，前端一处映射。下拉提交英文 key。

## Risks / Trade-offs

- [created_at NOT NULL + server_default 发 NULL] → 用 `sa_column` 显式 `server_default=func.now()`
  `nullable=False`（既有 pitfall）。
- [远程 migration 滞后 → 缺表 500] → `getPlayerNotes` 非 ok 降级 `[]`；且 push 前先跑远程 SQL。
- [机密泄露] → 只在 canEdit 时 fetch + 传 `null` 不渲染；写经 adminWrite scope 判权。
- [软导航复用 DOM 显示陈旧] → 评价区随 `sel` 已在 PlayerDetail 的 key remount 范围内（详情按 sel keyed）。
- [category 漂移] → DB check + 前端 literal union + label 映射三处一致；加类别要同改。

## Migration Plan

一个 migration（新表 `player_notes`）。本地签名解释器打本地栈；远程 Dashboard 手工执行**后**再 push
读该表的后端。回滚 = drop table + revert 提交。无其它部署影响。

## Open Questions

（explore 已定；apply 仅需确认 model 的 created_at server_default 写法落到 sa_column——设计已点明。）
