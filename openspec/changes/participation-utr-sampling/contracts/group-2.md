## Contract — Group 2: 前端 api + actions + 赛季级监控页

- **Spec**:
  - 监控页 SHALL 是赛季级、admin-only：仅有权时取数与渲染；能按组（金/银/待核）筛选；写（快照/定为）经 `adminWrite`。未解锁 SHALL 不取不显（就地锁定态，不发取数请求）。
  - 监控页 SHALL 每人显示采样列 + rated 均值 + 状态旗（待核/正常）+「快照今天」+「定为」（仅全 rated/can_set 出）；读失败 SHALL 降级为空不崩页。
- **Runtime**: `cd frontend && npx vitest run app/[season]/participation-utr` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0——未解锁不取、金/银/待核筛选、每人列+均值+旗、can_set 才出「定为」、降级空。
- **Code**:
  - **门用 super**（`isSuper`）：这是赛季级、跨金银的组委会工具，`canEdit(season,division)` 是按组的、盖不住跨组；组委会=super。页面 + 快照 + 定为都 super-only（`adminWrite` scope `"super-only"`）。非 super → 就地锁定态、不取数（别静默 redirect，CLAUDE.md）。
  - `lib/api.ts` 加采样类型 + `getSeasonSampling(year)`（非 ok/异常降级 `[]`）。server actions `snapshotToday(season)`/`setParticipationFromSampling(season, playerId)` 经 `adminWrite`（super-only）、成功 `revalidatePath`。
  - 赛季级路由 `/[season]/participation-utr`，**自带 `error.tsx`**。桌面表（overflow-x 自滚不裁——CLAUDE.md）+ 移动端每人卡日期横向滚。均值/旗由后端给,前端只渲染。
- **Threshold**: 70
