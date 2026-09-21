---
Date: 2026-09-20
Change: participation-utr-sampling
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# participation-utr-sampling — 5 天每日 UTR 采样、监控、rated 均值→参赛 UTR

参赛 UTR 取 9/21–9/25 五天双打 UTR 的均值。现在参赛 UTR 是一个手工冻结的单值,没有每日历史、没有监控。
本 change 加:每天把该赛季每个队员的当前双打 UTR 快照进一张**每日采样表**;一个 admin 监控页看 5 天走势 +
rated 天均值;组委会一键把均值「定为参赛 UTR」。projected/unrated 不进均值、打「待核」旗,由组委会走既有录入
给 match UTR。

## Goals

1. **每日采样表 + 快照写入。** 新表 `player_daily_utr`(`season_year`、`player_id`、`sample_date`、`doubles_utr`、
   `doubles_status`,唯一 `(season_year, player_id, sample_date)`)。「快照今天」端点:把该赛季**所有队员**当前
   `Player.doubles_utr`+`doubles_status` 打上今天日期存一行;同一天再快照 = upsert 覆盖当天那行。
   (先跑现有 `update-doubles-utr` 刷新当前值,再快照。)
2. **赛季级监控页(admin-only)。** 一页看金+银两组(可按组筛),每人一行:各采样日的双打 UTR 列 + **rated 天
   均值** + 状态旗(待核/正常)。「快照今天」按钮在此页。机密门同已存阵容/评论(仅 `canEdit` 取数与渲染)。
3. **rated 均值。** 均值只算 status=rated 的采样天;projected/unrated 的天不进均值。一个队员若有 projected/unrated
   采样(或达不到「可信 rated」阈值),整人打「待核」旗。
4. **一键「定为参赛 UTR」。** 组委会对某队员点确认,把 rated 均值写进 `PlayerSeasonUtr`(复用既有参赛 UTR 录入
   路径)。**人确认才落,不自动、不静默覆盖冻结值。** 待核队员不出「定为」按钮;组委会走既有录入手工给 match UTR。
5. **只双打。** 采样与均值都只针对双打 UTR(参赛口径);单打不采、不显示。

## Non-Goals

- 不采单打 UTR。
- 不自动把均值写进参赛 UTR(必须组委会逐人确认)。
- 不做抓取本身(每日刷新当前双打值仍由现有 `update-doubles-utr` skill / utr-import MCP 做);快照只读当前值。
- 不改排阵/cap 判定逻辑;参赛 UTR 一旦「定为」,下游照旧。
- 不做跨赛季采样历史对比;只服务当年冻结窗口。
- 不替组委会决定 projected/unrated 的 match UTR——只标记 + 提供既有录入入口。

## Constraints

- 架构不可违反:新表在 `zijing_cup` schema;只有 FastAPI 碰 DB;浏览器经 Next.js;读经 `lib/api.ts`、写经
  `lib/admin.ts` 的 `adminWrite`(按比赛 scope 判权)。
- **有 migration**(新表 `player_daily_utr`)。远程共享 Supabase 走 Dashboard 手工执行(no-CLI-push 规则);
  **读新表的后端 push 前远程 migration 必须先执行**,否则线上 500;只读旁支取数失败降级为空。
- `created_at`/时间戳列若 NOT NULL + DB 默认,模型用 `sa_column=Column(..., server_default=func.now(), nullable=False)`
  (别 `Optional=None`,会发 NULL——CLAUDE.md)。
- 「快照今天」是全有或全无的批量写;`sample_date` 用**服务端**日期(一个时钟),别信客户端传的日期。
- 快照读的是 `Player.doubles_utr`(当前值,全局非按赛季);采样行绑 `season_year` + `player_id`。同一人同赛季一天一行。
- 「定为参赛 UTR」写 `PlayerSeasonUtr` 要走既有录入/裁决语义(含 value_division 来源标注),别新拼一条绕过校验的写路径。
- 机密:采样/参赛数据是组委会内部,监控页仅 `canEdit`;未解锁不取不显。
- 写鉴权按 HTTP 方法自动判(WRITE_METHODS 中间件);新写路由不额外声明即受保护。
- `npm run test` 不做类型检查——验证带 `npx tsc --noEmit`;新源码无 `console.log`。

## Success Criteria

1. 后端:「快照今天」把该赛季全体队员当前双打值+status 以服务端今日日期 upsert 进 `player_daily_utr`(同日覆盖);
   批量端点读某赛季采样(按 player_id × date 分组);建表 SQL 以 `set search_path to zijing_cup, public;` 开头。
2. 均值:只算 rated 天;全 projected/unrated 或无 rated 采样 → 无均值、打「待核」;rated 均值按 UTR 口径取整(Decimal)。
3. 「定为参赛 UTR」:写 `PlayerSeasonUtr`(value + 来源标注),组委会逐人确认;待核队员无「定为」;不自动覆盖。
4. 前端:赛季级监控页(admin-only)显示金+银(可筛)、每人采样列 + rated 均值 + 状态旗 +「快照今天」+「定为」;
   `canEdit` 门(未解锁不取数);取数失败降级不崩页。
5. 后端 pytest + 前端 vitest + `npx tsc --noEmit` 全绿;新源码无 console.log;本地真实数据 e2e(快照 2 天→均值→
   定为→projected 待核)实测。

## User Stories

- 作为组委会,9/21–9/25 每天刷新完当前双打 UTR 后点「快照今天」,5 天后在监控页看每人 5 天走势与 rated 均值。
- 作为组委会,对一名 5 天都 rated 的队员点「定为参赛 UTR」,均值就成了他这赛季的参赛 UTR。
- 作为组委会,看到某队员是 projected/unrated(「待核」),我知道要单独去核实并手工给他 match UTR。

## Open Questions

### 已解决(Phase 3 确认)

- **采样窗口不硬编码**:采样表有几天算几天(≤5,9/21–9/25),均值 = 所有 rated 采样天的双打 UTR 均值。不把日期写死进代码/season 配置。
- **「待核」旗 + 「定为」出现条件**:只要有**任一**非 rated 采样天 → 该人打「待核」旗;仍显示 rated 均值供参考,但**不出「定为」按钮**(逼组委会人工核并手工给 match UTR)。**全部采样天都 rated 才出「定为」按钮**。
- **rated 均值取整**:2 位小数、round half-up(UTR 惯例)。
- **「定为」vs 赛季锁**:锁季后仍允许组委会显式「定为」覆盖参赛 UTR(这是组委会的主动动作)。代价(锁后仍可被一次「定为」改冻结值)写进 design,与「A 顺带改 B 要写护栏与代价」同族。
- **「快照今天」粒度**:每次全赛季一次(给该赛季金+银所有队员打今日采样);监控页按组只是筛选显示。

### 待 apply 收口(实现细节)

- rated 均值的 Decimal 全程与取整实现点(别按字符串比/算——CLAUDE.md)。
- 监控页采样列在 5 天/横向表在移动端的呈现(Phase 4 mock 定)。

## Referenced Capabilities

- `current-utr-io`(快照读 `Player.doubles_utr` 当前值;「定为」写 `PlayerSeasonUtr` 复用既有录入/mirror 语义)
- `player-registry`(队员、`PlayerSeasonUtr` 参赛值、赛季成员关系)
- `admin-access` / `admin-credentials`(监控页 canEdit 机密门 + 写鉴权)
- `lineup-ui` / `team-roster`(参赛 UTR 一旦定为,排阵/名单下游照旧读取)
