# participation-utr-sampling Specification

## Purpose
参赛 UTR 取 9/21–9/25 五天双打 UTR 均值。本能力给组委会:每天把每个队员当前双打 UTR 快照进采样表、监控 5 天
走势、按 rated 天算均值、一键把均值「定为参赛 UTR」;projected/unrated 打「待核」旗、走既有录入给 match UTR。

## Requirements

### Requirement: 每日双打 UTR 采样表

系统 SHALL 有一张 `player_daily_utr` 表:`season_year`、`player_id`(FK players)、`sample_date`(date)、
`doubles_utr`(可空)、`doubles_status`(可空);唯一 `(season_year, player_id, sample_date)`;`created_at`
server_default now() NOT NULL。同一 (赛季,人,日) 只有一行。删球员 SHALL 级联删其采样。

#### Scenario: 一人一赛季一天一行
- **WHEN** 同一赛季同一人同一天写两次采样
- **THEN** 表里仍只有一行(唯一约束),值为后写的(upsert)

### Requirement: 「快照今天」写入当前双打值

系统 SHALL 提供「快照今天」端点:把某赛季**所有队员**的当前 `Player.doubles_utr` + `doubles_status`,以
**服务端当日日期**为 `sample_date`,upsert 进 `player_daily_utr`。日期 MUST 用服务端时钟(不信客户端传的日期)。
同一天再快照 SHALL 覆盖当天那行。写 SHALL 需管理员凭据(按方法判权中间件)。

#### Scenario: 快照打今日日期、同日覆盖
- **WHEN** 组委会点「快照今天」两次(同一天)
- **THEN** 每个队员当天只有一行、为最后一次的当前值;`sample_date` = 服务端今天

#### Scenario: 覆盖全赛季队员
- **WHEN** 快照某赛季
- **THEN** 该赛季金+银所有有成员关系的队员各得一行(其当前双打值/状态)

### Requirement: 批量读某赛季采样

系统 SHALL 提供批量读端点,按赛季返回采样,便于监控页按 `player_id × sample_date` 组装。读 SHALL 需 backend
secret。读失败(如远程表未建)前端 SHALL 降级为空,不拖垮页面。

#### Scenario: 读回按人按日
- **WHEN** 读某赛季采样
- **THEN** 返回每人每采样日的双打 UTR + status,足以在前端拼出每人 5 天 + 均值

### Requirement: rated 天均值

某队员的建议参赛 UTR SHALL = 其采样中 **status=rated 的天**的双打 UTR 均值(2 位小数、round half-up);
projected/unrated 的天 MUST NOT 进均值。无任何 rated 采样天 SHALL 无均值。均值计算 MUST 全程 Decimal。

#### Scenario: 只算 rated 天
- **WHEN** 某人 5 天里 4 天 rated、1 天 projected
- **THEN** 均值 = 那 4 个 rated 值的均值(2 位),projected 天不计

#### Scenario: 无 rated 无均值
- **WHEN** 某人所有采样天都是 projected/unrated
- **THEN** 无均值、显示「—」

### Requirement: 「待核」旗与「定为参赛 UTR」

监控页 SHALL 对每个队员显示状态旗:采样中有**任一**非 rated(projected/unrated)天 → 「待核」;否则「正常」。
「定为参赛 UTR」按钮 SHALL **仅在全部采样天都 rated 时**出现;点它 SHALL 把 rated 均值写进该队员该赛季的
`PlayerSeasonUtr`(**复用既有参赛 UTR 录入语义**,含来源标注),且 MUST 由组委会逐人确认——不自动、不静默覆盖冻结值。
「待核」队员 MUST NOT 出「定为」按钮,而给一句提示指向既有录入。「定为」复用既有 `set_season_utr` 命令,因此
**赛季已锁时 SHALL 被既有赛季锁拒**(409),前端提示「先解锁再定为」——MUST NOT 加绕过锁的旁路(避免一次
「定为」静默覆盖已冻结值;采样窗口正常在锁季之前,不会撞锁)。

#### Scenario: 全 rated 才可定为
- **WHEN** 某人全部采样天 rated
- **THEN** 出「定为 X」按钮(X=rated 均值),点确认写进 `PlayerSeasonUtr`

#### Scenario: 待核不可一键定为
- **WHEN** 某人有 projected/unrated 采样天
- **THEN** 打「待核」旗、不出「定为」按钮,给「组委会核 match UTR」提示

### Requirement: 监控页机密 + admin-only

监控页 SHALL 是赛季级、admin-only:仅 `canEdit` 时取数与渲染(采样/参赛数据是组委会内部,未解锁不取不显)。
页面 SHALL 能按组(金/银/待核)筛选显示。写(快照/定为)经 `adminWrite`。

#### Scenario: 未解锁看不到
- **WHEN** 未解锁本比赛
- **THEN** 不取采样、不显示监控内容(就地锁定态或提示,不发取数请求)
