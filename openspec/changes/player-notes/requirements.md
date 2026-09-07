---
Date: 2026-09-06
Change: player-notes
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# player-notes — 球员评价（分类 + 追加式时间线）

给一名球员记教练评价：优点、弱点、适合的搭档等。评价**随时间叠加**——多条追加、每条带时间，不是
覆盖一整段文字。展示在队员详情右栏（`player-admin-workbench` 的 `PlayerDetail`）。评价是主观教练笔记、
机密，只有解锁本比赛的人能看/写。

## Goals

1. **追加式评价，每条带类别。** 一条评价 = 类别（优点 / 弱点 / 搭档 / 其他）+ 一段文本 + 创建时间。
   写入是**追加**一条新记录，不覆盖既有的。列表按时间倒序（最新在上），类别以标签标出。
2. **挂在球员上（跨赛季全局）。** 评价关于这个人，不按赛季分——挂 `player_id`。从队员工作台的某个
   比赛上下文写入，权限按该上下文的 `canEdit` 判。
3. **机密，按比赛判权。** 评价 SHALL 按 `canEdit(season, division)` gate：未解锁本比赛者看不到任何
   评价、也写不了；页面仅在 canEdit 时取评价（不进非管理员 HTML），无游客视图。
4. **只追加 + 可删。** 可追加、可**删除某一条**（写错了能撤），但 MUST NOT 就地编辑一条（时间线保真）。
   删除要就地确认。
5. **右栏「评价」区。** `PlayerDetail` 新增「评价」区：顶部一个追加表单（类别下拉 + 文本 + 追加按钮），
   下面时间线列表（每条：类别标签 + 文本 + 时间 + 删除）。空文本不提交。

## Non-Goals

- 不做就地编辑一条评价（只追加 + 删）。
- 搭档不做结构化选人——「搭档」类别就是自由文本写名字。
- 不存作者/归属（v1 单教练团队假设；将来要区分哪个队长写的再加）。
- 不做评价的检索/筛选/跨球员聚合；不做评分/打星（纯文字评价）。
- 不改已有球员数据模型；评价是独立新表，删表即回到没有评价的状态。

## Constraints

- 架构不可违反：新表在 `zijing_cup` schema；只有后端连库；取数经 `lib/api.ts`、写经 `lib/admin.ts`
  的 `adminWrite`（按比赛 scope 判权、唯一写出口）；浏览器不接触后端凭据。
- **有 migration**：新表 `player_notes`。远程共享 Supabase 的 migration 走 Dashboard 手工执行（见
  CLAUDE.md no-CLI-push 规则）；**后端读新表的代码 push 前，远程 migration 必须先执行**，否则线上 500。
  本地用签名解释器把 migration SQL 打到本地栈（断言 127.0.0.1）。
- 类别存英文 key（`strength`/`weakness`/`partner`/`other`）+ DB check 约束；前端显示中文（同 season
  UTR status 的 key→label 做法）。响应字段在 `lib/api.ts` 收成 literal union，后端漂移红 tsc。
- GET 评价受 `X-Backend-Secret`（只 Next 服务端能取，故能在 canEdit 判定后安全取）；页面**仅在 canEdit
  时** fetch（同已存阵容，不把机密塞进非管理员 HTML）。POST/DELETE 是写方法，中间件自动要求
  `X-Admin-Secret`。
- `created_at` 用 DB `server_default=now()`、`NOT NULL`（别在模型里给 `Optional[datetime]=None`，会发
  显式 NULL 触发 NotNullViolation——见 CLAUDE.md 那条）。
- 删除要就地确认（同队伍页「移出」），写动作 try/catch、把后端 detail 就地显示、成功才刷新。

## Success Criteria

- 解锁本比赛后，队员详情右栏出现「评价」区：选类别 + 输文本 + 追加 → 列表最上方出现该条（类别标签 +
  文本 + 时间）。
- 再追加一条 → 两条都在，按时间倒序；不覆盖。
- 删除某条经确认后消失，其余不动；被删的不影响其它球员。
- 未解锁本比赛：看不到评价区内容、也没有追加/删除入口；页面不发取评价的请求。
- 后端不带 `X-Backend-Secret` 读评价被拒；不带 `X-Admin-Secret` 写被拒；空文本不写。
- 真实数据实测：给某球员追加优点、弱点、搭档各一条，倒序显示；删掉一条其余保留；换个未解锁会话看不到。

## User Stories

- 作为队长/负责人（已解锁本比赛），我想把对某球员的观察（优点、弱点、和谁搭档好）随时记下来，一条条
  累积，日后排阵或裁决时回看，而不是只有一个 UTR 数字。

## Open Questions

已定（无悬空歧义）：
- 作者归属：v1 不存（单教练团队）；将来区分哪个队长写的再加字段。
- 跨比赛可见：评价挂球员（全局），任何解锁了「当前 URL 那个比赛」的人可见——与队员工作台改字段的
  权限模型一致（按 URL 比赛的 canEdit 判），是既定取舍。
- 类别取值固定四类（strength/weakness/partner/other），DB check 约束；将来加类别改约束 + 前端 label。

## Referenced Capabilities

- **player-notes**（新能力：`player_notes` 表 + GET/POST/DELETE 端点 + 详情右栏「评价」区）。
- **player-admin-ui**（评价区挂在 `PlayerDetail` 右栏；沿用 canEdit 的查看/编辑门与 `EditOnly` 风格）。
- **admin-access / admin-credentials**（`canEdit(season,division)` gate + `adminWrite` 按比赛 scope 判权；
  GET 受 `X-Backend-Secret`、写受 `X-Admin-Secret`，与现有一致）。
- **player-registry**（`players` 表；评价以 `player_id` 外键挂上，独立新表）。
