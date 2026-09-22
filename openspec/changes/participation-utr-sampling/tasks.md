## 1. 后端：采样表 + 快照 + 批量读 + rated 均值/旗 + 「定为」

### Contract
- **Spec**:
  - 系统 SHALL 有一张 `player_daily_utr` 表：`season_year`、`player_id`(FK players)、`sample_date`、`doubles_utr`(可空)、`doubles_status`(可空)；唯一 `(season_year, player_id, sample_date)`；`created_at` server_default now() NOT NULL。删球员 SHALL 级联删其采样。
  - 系统 SHALL 提供「快照今天」端点：把某赛季所有队员当前 `Player.doubles_utr`+`doubles_status`，以服务端当日日期 upsert 进表（同日覆盖）；写需管理员凭据。
  - 系统 SHALL 提供批量读端点（backend secret），按赛季返回采样供监控页组装。
  - 建议参赛 UTR SHALL = status=rated 天的双打 UTR 均值（2 位、round half-up、全程 Decimal）；无 rated 天无均值。「待核」= 有任一非 rated 采样天。「定为」仅全 rated 时可，写 `PlayerSeasonUtr` 复用既有 `set_season_utr`（锁季 409 透传、不加旁路）。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_participation_utr_sampling.py -q`（需 BACKEND_SECRET/ADMIN_SECRET env）→ expected: 全绿——快照 upsert 同日覆盖 + 服务端日期 + 全赛季覆盖、批量读分组、rated 均值只算 rated 天/无 rated 无均值/2 位、待核判定、定为写 PlayerSeasonUtr、锁季 409、鉴权 401/403。
- **Code**:
  - `PlayerDailyUtr` 模型 `created_at` 用 `sa_column=Column(DateTime(tz), server_default=func.now(), nullable=False)`；migration 整份一次 execute（断言 127.0.0.1）、`set search_path` 打头、唯一约束。
  - 快照用服务端 `date.today()`（一个时钟）；upsert `(season,player,today)`；全有或全无一次 commit。
  - 均值/旗后端算（Decimal 全程、`quantize(0.01, ROUND_HALF_UP)`、只 rated 天）。「定为」复用 `command.set_season_utr`（source 标注采样均值；`SEASON_UTR_SOURCES` 缺则加 `sampling_avg`），锁季 `SeasonLocked`→409。
  - 写鉴权靠方法判权中间件；不加前缀判断/依赖。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/participation-utr-sampling/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — write failing pytest: 「快照今天」把某赛季全体队员当前双打值以服务端今日日期写入；同日再快照 → 每人当天仍一行（upsert 覆盖）
- [x] 1.2 GREEN — `PlayerDailyUtr` 模型 + migration + 本地 execute；注册；快照端点（服务端日期、upsert、全赛季）
- [x] 1.3 RED — write failing pytest: 批量读按赛季回每人每日采样；rated 均值只算 rated 天（2 位 round half-up）、无 rated 天无均值；待核 = 有任一非 rated 天
- [x] 1.4 GREEN — 批量读端点 + rated 均值/旗 helper（Decimal 全程）
- [x] 1.5 RED — write failing pytest: 「定为」把 rated 均值写进 `PlayerSeasonUtr`（source 标注）；锁季 → 409 透传；快照/定为无 admin → 403、读无 backend secret → 401
- [x] 1.6 GREEN — 「定为」端点复用 `set_season_utr`（锁季 409）+ 鉴权透传
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：api + actions + 赛季级监控页

### Contract
- **Spec**:
  - 监控页 SHALL 是赛季级、admin-only：仅 `canEdit` 时取数与渲染；能按组（金/银/待核）筛选；写（快照/定为）经 `adminWrite`。未解锁 SHALL 不取不显（就地锁定态，不发取数请求）。
  - 监控页 SHALL 每人显示采样列 + rated 均值 + 状态旗（待核/正常）+「快照今天」+「定为」（仅全 rated 出）；读失败 SHALL 降级为空不崩页。
- **Runtime**: `cd frontend && npx vitest run app/[season]/participation-utr` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0——机密门（未解锁不取）、金/银/待核筛选、每人列+均值+旗、全 rated 才出「定为」、降级空。
- **Code**:
  - `lib/api.ts` 加采样类型 + `getSeasonSampling(year)`（非 ok/异常降级 `{}`/`[]`）。server actions `snapshotToday`/`setParticipationFromSampling` 经 `adminWrite` scope、成功 `revalidatePath`。
  - 赛季级路由（admin-only 机密门，未解锁就地锁定态不发请求——别静默 redirect，CLAUDE.md）；**自带 `error.tsx`**。桌面表（overflow-x 自滚，长表不裁——CLAUDE.md）+ 移动端每人卡日期横向滚。
  - 均值/旗由后端给，前端只渲染（少重复逻辑）。
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/participation-utr-sampling/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-20-participation-utr-sampling-mocks.html; note tokens（surface/border/primary/warning/success/muted-fg）+ verbatim 文案（「快照今天」「定为 X」「✓ 已定」「待核」「正常」「组委会核 match UTR」、筛选「全部/金组/银组/待核」）
- [x] 2.2 RED — write failing vitest: `getSeasonSampling([]/未解锁)` 不取 → 空；非 ok → 空；正常 → 每人每日 + 均值 + 旗
- [x] 2.3 GREEN — `lib/api.ts` 采样类型 + `getSeasonSampling`（降级）+ server actions（adminWrite、revalidate）
- [x] 2.4 RED — write failing vitest: 监控页组件——未解锁不渲染内容；金/银/待核筛选；每人列+均值+旗；全 rated 出「定为」、待核不出
- [x] 2.5 GREEN — 监控页（机密门 + 筛选 + 表/卡 + 快照/定为动作）+ 路由 `error.tsx`
- [x] 2.6 VISUAL DIFF — bring up dev stack；解锁进监控页；对照 mock（工具条、5 列表、均值、待核旗色、定为按钮、移动端卡横滚）；fix token/color/text 漂移
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证 + 交付

- [x] 3.1 Run backend test suite — `backend/.venv-std/Scripts/python.exe -m pytest -q`（先跑测试，再补种——CLAUDE.md）；无回归
- [x] 3.2 Run frontend test suite — `cd frontend && npx vitest run` + `npx tsc --noEmit`；无回归、tsc 0
- [x] 3.3 E2E — 补种 + 起后端/前端 + 登录：连快照 2 天（改当前双打值制造差异）→ 监控页看 5 列 + rated 均值；对全 rated 队员「定为」→ 查 `PlayerSeasonUtr` 落值；把某人某天设 projected → 该人「待核」、无「定为」；未解锁不取；测完删测试数据
- [x] 3.4 Run superpowers:verification-before-completion — 跑 test_commands + `npx tsc --noEmit`；`grep -rn 'console.log' frontend/app frontend/lib` 应空；migration schema-qualified；**push 前远程 Dashboard 建 `player_daily_utr` 的前置在交付说明点明**（读新表后端 push 前先建表）
