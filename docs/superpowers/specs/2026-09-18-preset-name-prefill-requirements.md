---
Date: 2026-09-18
Change: preset-name-prefill
Status: REVIEWED
HAS_UI_SURFACE: no
---

# preset-name-prefill — 载入阵型后自动填名字，「存为阵型」变「更新「X」」

排阵页「存为阵型」(preset)载入一套后，名字框是空的：想改了约束再存回同一套，得手动重打原名，
否则打新名就变新建。后端本就「同名即更新」，缺的只是前端把名字接上。让载入后名字框自动带上那套阵型的名，
按钮据此变「更新「X」」，一键存回。

## Goals

1. **载入即带名。** 载入一套阵型后，「阵型名」输入框自动填上该阵型的名字。
2. **按钮随名变。** 当前输入的名字命中某个已存阵型 → 按钮显示「更新「<名>」」；否则「存为阵型」(新建)。
   随用户改名实时切换（改成新名 → 自动变新建；改回原名 → 变更新）。
3. **一键存回。** 载入 → 改锁定/pin/排除 → 直接按「更新「<名>」」= 覆盖那套（复用后端同名即更新，
   改了约束名字仍在、仍算更新）。
4. **保住既有约束。** 保存仍读**实时表单**约束（`constraintsFromForm`），不读 URL——载入后的编辑照样进得去。
5. **仅编辑模式。** 沿用现状：保存/更新行只在 `canEdit && editing` 出现（查看模式不显示，不改这条）。

## Non-Goals

- N/A (bounded) —— 不改后端、不改保存语义（同名即更新已存在）；不加二次确认（「更新「X」」文案已明示，
  且是用户自己那套）；不做 preset 的重命名/复制；不碰已存阵容(saved lineups)那套。

## Constraints

- 架构不变：前端改动，写仍经 `savePreset` → `adminWrite`。
- `Presets` 是 client 组件：用 `useSearchParams()` 读载入参数 seed 名字框；名字框是受控 `useState`，
  seed 用「按参数值 keyed 的 effect」，别覆盖用户正在打的字（载入新阵型→重新 seed；保存后 reset 不重 seed）。
- 载入 href 由 `buildLoadHref` 生成：加一个 `preset=<名字>`(URL 编码) 参数带出阵型名；其余 locks/pins/ex 不变。
- `npm run test` 不做类型检查——验证带 `npx tsc --noEmit`；新源码无 `console.log`。

## Success Criteria

1. `buildLoadHref` 输出里含 `preset=<名字>`（URL 编码），locks/pins/ex 参数不变。
2. `Presets`：URL 有 `preset=X` 时名字框初值为 `X`；无则空。
3. 按钮文案：名字命中已存阵型名 → 「更新「X」」；否则「存为阵型」；改名实时切换。
4. 「更新」路径调 `saveAction(live, X)`（同名）→ 覆盖；载入后改了约束仍带原名保存（读实时表单）。
5. 空名 / 无约束时按钮禁用或给提示（沿用现状）；仅编辑模式显示（沿用现状）。
6. vitest 覆盖上述 + `npx tsc --noEmit` 全绿；无 console.log。

## User Stories

- N/A (bounded) —— 见 Goals：作为队长，载入一套阵型、调两个锁定，直接点「更新「主力」」存回，不用重打名字。

## Open Questions

- 无。（seed 用 useSearchParams + keyed effect；文案 name-match 推导；静默覆盖——均已定。）

## Referenced Capabilities

- `lineup-filter-presets`（本 change 的宿主：`Presets` UI + `buildLoadHref` + `savePreset` 同名更新语义）
