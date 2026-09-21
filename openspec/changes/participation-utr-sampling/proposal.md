---
Date: 2026-09-20
Change: participation-utr-sampling
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-20-participation-utr-sampling-requirements.md
---

## Why

参赛 UTR 取 9/21–9/25 五天双打 UTR 均值。现在参赛 UTR 是手工冻结的单值,没有每日历史、没有监控。给组委会一个:
每天把当前双打值快照进采样表 → 监控页看 5 天走势 + rated 均值 → 一键把均值「定为参赛 UTR」。

## What Changes

- 新表 `player_daily_utr`(`season_year`、`player_id`、`sample_date`、`doubles_utr`、`doubles_status`,
  唯一 `(season_year, player_id, sample_date)`)。
- 「快照今天」端点:把该赛季**所有队员**当前 `Player.doubles_utr`+`doubles_status` 以**服务端今日日期** upsert 进采样表
  (同日覆盖)。
- 批量读端点:读某赛季采样(按 player_id × date)供监控页。
- 「定为参赛 UTR」:把某队员 rated 天均值写进 `PlayerSeasonUtr`(**复用既有参赛 UTR 录入路径**,组委会逐人确认、
  不自动、不静默覆盖冻结值)。
- 前端赛季级监控页(admin-only):金+银可筛,每人采样列 + rated 均值 + 状态旗(待核/正常)+「快照今天」+「定为」。
  **全部采样天都 rated 才出「定为」**;有非 rated 天 → 待核、给提示、指向既有录入。
- **有 migration**;远程 Dashboard 手工执行后读新表才生效(只读旁支取数失败降级为空)。

## Capabilities

### New Capabilities

- `participation-utr-sampling` — 每日双打 UTR 采样表 + 「快照今天」写入 + 批量读;赛季级 admin 监控页(5 天列 +
  rated 均值 + 待核旗)+ 组委会「定为参赛 UTR」(全 rated 才可、写 `PlayerSeasonUtr`);机密门 + 失败降级。

### Modified Capabilities

<none — 「定为」只是**调用** `current-utr-io`/`player-registry` 既有的参赛 UTR 录入语义写 `PlayerSeasonUtr`,
不改它们的需求;快照只**读** `Player.doubles_utr` 当前值。监控页是新宿主 UI,不改既有页需求。>

## Impact

- **后端**:新 `PlayerDailyUtr` 模型 + migration(`zijing_cup.player_daily_utr`,唯一 (season,player,date)、
  `created_at` server_default);新路由(「快照今天」POST + 批量读 GET + 「定为」写)挂 `routers/`(players 或新
  utr-sampling 路由);注册进 main + `models/__init__`。「定为」走既有 `PlayerSeasonUtr` 录入 helper。
- **前端**:`lib/api.ts` 加采样类型 + `getSeasonDailyUtr`(降级空);server actions `snapshotToday`/`setParticipationUtr`
  经 `adminWrite`;新监控页(赛季级路由,admin-only 机密门,金银筛选、5 列表 + rated 均值 + 待核旗 + 两个动作)。
- **有 migration、有远程前置**(push 前远程先建表,否则读新表 500;只读降级)。

## Out of Scope

- 单打 UTR 采样。
- 自动把均值写参赛 UTR(必须逐人确认)。
- 抓取本身(每日刷新当前双打值仍由 `update-doubles-utr` skill / utr-import MCP);快照只读当前值。
- 替组委会决定 projected/unrated 的 match UTR(只标记 + 指向既有录入)。
- 跨赛季采样历史对比。
