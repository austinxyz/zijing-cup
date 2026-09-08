---
Date: 2026-09-07
Change: lineup-comments
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# lineup-comments — 已存阵容评论（追加 + 查看）

跟球员评价（`player-notes`）对称：队员可以看 note，阵容可以看评论。给**已存阵容**（saved lineups）加评论——
一条条追加、带时间、可删、不就地编辑——记「这套打谁用、为什么这么排、注意哪条线」。评论是纯自由文本。
已存阵容本就是管理员机密（要解锁本比赛才看得到），所以评论天然按 `canEdit` gate。

## Goals

1. **阵容评论：追加 + 查看。** 一条评论 = 一段自由文本 + 创建时间，挂在某个 `saved_lineup` 上。写入是追加、
   列表倒序（最新在上）。可删除某一条（写错能撤），MUST NOT 就地编辑（时间线保真，对称 notes）。
2. **挂在已存阵容上、随其生命周期。** 评论 FK 到 `saved_lineups.id`，`on delete cascade`——删阵容连带删评论。
   **克隆阵容 MUST NOT 复制评论**（评论是对原阵容的批注；克隆是拿去改的新阵容）。改名/重排/存回不影响评论。
3. **机密，天然按 canEdit。** 已存阵容只在 `canEdit` 时才取数与渲染（现状）；评论随卡片一起，只有能看到该
   阵容的人（canEdit）才看得到评论。未解锁者既看不到阵容也看不到评论。
4. **卡片内可展开「评论」区。** 每张已存阵容卡片底部一个「评论 N ▾」，展开显示倒序时间线（文本 + 时间 +
   删除）+ 追加框；**追加/删除只在编辑模式**（`canEdit && editing`，与卡片其它写控件一致），查看模式只读。
5. **批量取，一次往返。** 一屏多张已存阵容卡片，MUST NOT 每张一次请求；用按 saved_lineup id 列表批量取的
   读端点（对称 notes 批量端点），一次拿回按 saved_lineup_id 分组的评论。
6. **失败降级。** 评论是只读旁支：批量取失败 SHALL 降级为空（不显示评论区计数/内容），已存阵容卡片主体照常
   （对称 `getSavedLineups`/`getPlayerNotesBatch` 的降级）。

## Non-Goals

- 不给**候选阵容**（临时搜索结果，每次重算）加评论——只 saved lineups。
- 不做就地编辑一条评论（追加 + 删）。
- 不做分类/评分/@人/富文本——纯文本一条条追加。
- 不改 saved_lineups 的重判/克隆/改名/重排逻辑（除克隆不带评论这一条对齐）。
- 不做跨阵容的评论聚合/检索。

## Constraints

- 架构不可违反：新表在 `zijing_cup` schema；只有后端连库；读经 `lib/api.ts`、写经 `lib/admin.ts` 的
  `adminWrite`（按比赛 scope 判权、唯一写出口）；浏览器不接触后端凭据。
- **有 migration**：新表 `lineup_comments`。远程共享 Supabase 走 Dashboard 手工执行（no-CLI-push 规则）；
  **后端读新表的代码 push 前，远程 migration 必须先执行**，否则线上追加/删除 500（读降级为空、不打崩排阵页）。
- 写鉴权按 HTTP 方法自动判（`WRITE_METHODS` 中间件）——新写路由不额外声明即受保护；读端点走 backend secret。
- NOT NULL + DB 默认值的列（`created_at`）用 `sa_column=Column(..., server_default=func.now(), nullable=False)`，
  别 `Optional[...]=None`（会发 NULL，见 CLAUDE.md）。
- 追加/删除 UI 放卡片内可展开区（不是弹层）——躲开触屏 hover 弹层的坑；追加空文本不可提交、写失败就地报错。
- `npm run test` 不做类型检查——验证带 `npx tsc --noEmit`；新源码无 `console.log`。

## Success Criteria

1. 后端：批量端点按 saved_lineup id 分组倒序返回、只放有评论的 id、空 ids → 空映射；POST 追加（空 body 拒、
   超长拒 422）、DELETE 删一条（跨阵容不可删、404）；GET 需 backend secret、POST/DELETE 需 admin secret；
   删阵容级联删评论；建表 SQL 以 `set search_path to zijing_cup, public;` 开头、body 长度 CHECK。
2. 前端：`getLineupCommentsBatch` 非 ok 降级 `{}`；`addLineupComment`/`deleteLineupComment` 经 `adminWrite`
   scope `{season,division}`、成功 `revalidatePath` 刷新。
3. UI：已存阵容卡片「评论 N ▾」可展开，倒序时间线 + 编辑模式追加/删除（就地确认）；查看模式只读；未解锁看不到。
4. 克隆一套阵容不带来原阵容的评论；删阵容其评论随之消失。
5. 后端 pytest + 前端 vitest + `npx tsc --noEmit` 全绿；新源码无 console.log；本地真实数据 e2e（追加+删除+
   查看 + 克隆不复制 + 机密门）实测。

## User Stories

- 作为队长，我把一套阵容存下来，想记一句「打 THU 用这套，D2 偏弱盯紧」，下次翻到这套一眼看到。
- 作为队长，我想给某套阵容补充几条随时间累积的注记（对上不同对手的心得），一条条追加、旧的留着。
- 作为只读访问者（未解锁），我看不到已存阵容，也看不到它的评论——都是机密。

## Open Questions

- 评论区默认展开还是折叠？倾向**折叠**（卡片已密，`评论 N ▾` 点开、计数可见），点开显示时间线/追加。（mock 阶段定）

### 已解决

- **批量端点形态**：`GET /api/players/notes` 的对称——按 saved_lineup id 列表 `GET /api/…/lineup-comments?ids=1,2`，
  返回 `{saved_lineup_id: Comment[]}`，只放有评论的 id、去重/忽略非法/clamp、走 backend secret。
- **单条评论长度上限**：对齐 notes = 2000（DB CHECK + 请求模型 max_length，超长 422 不落 500）。

## Referenced Capabilities

- `lineup-saved-lineups`（评论挂在其 `saved_lineups` 表上；克隆/删除/重判语义对齐——克隆不带评论、删级联）
- `lineup-ui`（已存阵容卡片是评论区的宿主 UI）
- `player-notes` / `notes-surfacing`（对称参照：同款追加式时间线 + 批量读 + 降级 + 机密门；可复用展示/常量思路）
- `admin-access` / `admin-credentials`（`canEdit` 机密门与写鉴权）
