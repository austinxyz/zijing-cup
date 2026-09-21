## Context

参赛 UTR 现在是 `PlayerSeasonUtr` 里手工冻结的单值,`command.set_season_utr(session, player_id, season, value,
source, status, under_appeal)` 是唯一录入路径(锁季时抛 `SeasonLocked`→409)。当前双打值在 `Player.doubles_utr`
(全局、每次覆盖)。没有每日历史。本 change 加每日采样表 + 快照 + 监控页 + 「定为」(复用 set_season_utr)。

## Goals / Non-Goals

**Goals:** 每日采样表 + 「快照今天」(服务端日期 upsert 全赛季当前双打值) + 批量读 + rated 均值 + admin 监控页
(5 列 + 均值 + 待核旗 + 快照/定为) + 「定为」写参赛 UTR(全 rated 才可、组委会确认)。
**Non-Goals:** 单打采样、自动定为、抓取、替组委会决 projected/unrated 值、跨赛季对比、绕过赛季锁。

## Decisions

- **D1 表**:`PlayerDailyUtr`(`season_year` FK seasons、`player_id` FK players `ondelete=CASCADE`、`sample_date`
  date、`doubles_utr` Optional[Decimal]、`doubles_status` Optional[str]、`created_at` server_default)。migration
  以 `set search_path to zijing_cup, public;` 开头 + 唯一 `(season_year, player_id, sample_date)` + 索引
  `(season_year, sample_date)`。**本地按整份文件一次 execute**(别按 `;` 切句——CLAUDE.md)。注册 `models/__init__`+main。
- **D2 快照端点**:`POST /api/seasons/{year}/participation-utr/snapshot`(写方法自动受 admin 中间件保护)。服务端
  取 `date.today()`(平台时区注意;用服务端一个时钟),查该赛季所有有 membership 的 player,读各自 `Player.doubles_utr`
  /`doubles_status`,对 `(season, player, today)` 做 **upsert**(存在则更新值,不存在则插)。全有或全无一次 commit。
  返回写了几人 + 日期。
- **D3 批量读**:`GET /api/seasons/{year}/participation-utr`(backend secret)。回该赛季所有采样行(或按人分组)
  + 每人的成员组别(金/银,用于前端筛选)+ 姓名。前端据此拼每人 `date→value/status`、算 rated 均值、判待核。
  也可后端顺带算好 `rated_avg` 与 `flag`(减前端重复逻辑);倾向**后端算均值/旗**(Decimal 全程、round half-up、
  只 rated 天),前端只渲染。
- **D4 均值/旗**:后端 helper `rated_average(samples)`:取 status=='rated' 的天,Decimal 均值 `quantize(0.01,
  ROUND_HALF_UP)`;无 rated→None。`flag`:任一非 rated 采样天→'待核',否则'正常'。`can_set`:全部采样天 rated
  且有均值。
- **D5 「定为」**:`POST /api/players/{player_id}/season-utrs/{year}/from-sampling`(或直接前端调既有
  `set_season_utr`,传 value=rated 均值、source 标注为采样均值)。**复用 `command.set_season_utr`**——因此锁季抛
  `SeasonLocked`→409,前端提示「先解锁再定为」。**不加绕过锁的旁路**(避免静默覆盖冻结值;采样窗口正常在锁季前)。
  `source` 用一个明确值(如 `sampling_avg`,若 `SEASON_UTR_SOURCES` 没有则加一个),来源可追。
- **D6 前端**:`lib/api.ts` 加 `DailyUtrRow`/`SeasonSamplingOut` + `getSeasonSampling(year)`(非 ok 降级空)。
  server actions `snapshotToday(season,division)`、`setParticipationFromSampling(season,division,playerId,value)`
  经 `adminWrite` scope、成功 `revalidatePath`。赛季级监控页(`/[season]/participation-utr` 或挂已有赛季壳):
  **canEdit 机密门**(未解锁不取、就地锁定态),金/银/待核筛选,桌面表(每人 5 日期列 + 均值 + 旗 + 定为)+
  移动端每人卡(日期横向滚)。**新路由自带 `error.tsx`**(CLAUDE.md)。
- **D7 机密门 + 降级**:仅 `canEdit` 时 `getSeasonSampling` 取数;未解锁就地锁定态、不发请求(与 opponent-compare
  同款,别静默 redirect)。取数失败降级空(远程 migration 滞后不崩页)。

## Risks / Trade-offs

- **[远程 migration 滞后]** → 读降级空;push 前远程 Dashboard 先建 `player_daily_utr`,否则快照/读 500。既定前置。
- **[服务端日期时区]** → 用服务端 `date.today()` 一个时钟;Render 容器时区若非本地要注意(采样日以服务端为准,
  监控页显示服务端日期,避免两地日期错位)。
- **[锁季与定为的张力]** → 复用 set_season_utr、锁季 409 透传,不加旁路(见 D5)。这**收窄了 requirements 里
  「锁季后仍可覆盖」的说法**——更安全,handoff 会点给负责人;正常窗口在锁前不受影响。
- **[Decimal 均值]** → 全程 Decimal、round half-up quantize;别按字符串比/算(CLAUDE.md)。
- **[快照读当前值,当前值陈旧]** → 快照只忠实存「点快照那刻的当前双打值」;要新值先跑 `update-doubles-utr` 再快照
  (工作流依赖,写进页面提示)。
- **[单测测不出机密/布局]** → 端点/均值/旗/降级有单测;真机 e2e 补(快照 2 天→均值→定为→projected 待核→未解锁不取)。

## Migration Plan

新表 `player_daily_utr`。本地:migration 整份一次 execute(断言 127.0.0.1)。远程共享 Supabase:**push 读新表的
后端前**去 Dashboard SQL Editor 手工执行;否则快照/读 500(读已降级空、监控页锁定态不崩)。migration 仍是唯一来源。

## Open Questions

- `SEASON_UTR_SOURCES` 是否已有合适 source 值给「采样均值」,还是加一个 `sampling_avg`(apply 时看常量定)。
- 均值/旗 放后端算(倾向)还是前端算——倾向后端(Decimal 全程、少重复);apply 收口。
