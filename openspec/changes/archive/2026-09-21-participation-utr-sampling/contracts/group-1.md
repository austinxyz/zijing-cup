## Contract — Group 1: 采样表 + 快照 + 批量读 + rated 均值/旗 + 「定为」

- **Spec**:
  - 系统 SHALL 有一张 `player_daily_utr` 表：`season_year`、`player_id`(FK players)、`sample_date`、`doubles_utr`(可空)、`doubles_status`(可空)；唯一 `(season_year, player_id, sample_date)`；`created_at` server_default now() NOT NULL。删球员 SHALL 级联删其采样。
  - 系统 SHALL 提供「快照今天」端点：把某赛季所有队员当前 `Player.doubles_utr`+`doubles_status`，以服务端当日日期 upsert 进表（同日覆盖）；写需管理员凭据。
  - 系统 SHALL 提供批量读端点（backend secret），按赛季返回采样供监控页组装。
  - 建议参赛 UTR SHALL = status=rated 天的双打 UTR 均值（2 位、round half-up、全程 Decimal）；无 rated 天无均值。「待核」= 有任一非 rated 采样天。「定为」仅全 rated 时可，写 `PlayerSeasonUtr` 复用既有 `set_season_utr`（锁季 409 透传、不加旁路）。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_participation_utr_sampling.py -q`（需 BACKEND_SECRET/ADMIN_SECRET env）→ expected: 全绿——快照 upsert 同日覆盖 + 服务端日期 + 全赛季覆盖、批量读分组、rated 均值只算 rated 天/无 rated 无均值/2 位、待核判定、定为写 PlayerSeasonUtr、锁季 409、鉴权 401/403。
- **Code**:
  - `PlayerDailyUtr` 模型 `created_at` 用 `sa_column=Column(DateTime(tz), server_default=func.now(), nullable=False)`；migration 整份一次 execute（断言 127.0.0.1）、`set search_path` 打头、唯一约束。
  - 快照用服务端 `date.today()`（一个时钟）；upsert `(season,player,today)`；全有或全无一次 commit。
  - 均值/旗后端算（Decimal 全程、`quantize(0.01, ROUND_HALF_UP)`、只 rated 天）。「定为」复用 `command.set_season_utr`（source=`admin_ruling`、status=`committee`；采样均值本就是组委会裁定），锁季 `SeasonLocked`→409。
  - 写鉴权靠方法判权中间件；不加前缀判断/依赖。
- **Threshold**: 80
