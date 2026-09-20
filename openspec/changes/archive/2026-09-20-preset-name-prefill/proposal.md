---
Date: 2026-09-18
Change: preset-name-prefill
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-09-18-preset-name-prefill-requirements.md
---

## Why

排阵页载入一套阵型(preset)后,名字框是空的:改了约束想存回同一套,得手动重打原名,否则打新名就变新建。
后端本就「同名即更新」,缺的只是前端把名字接上——让载入后名字自动带上、按钮变「更新「X」」,一键存回。

## What Changes

- `buildLoadHref` 生成的载入链接多带一个 `preset=<名字>`(URL 编码)参数;locks/pins/ex 不变。
- `Presets`(client)用 `useSearchParams` 读 `preset`,seed「阵型名」输入框(受控 state,按参数值 keyed 的
  effect,不覆盖用户正在打的字)。
- 「存为阵型」按钮文案改为**按当前名字是否命中已存阵型推导**:命中 → 「更新「X」」,否则 → 「存为阵型」;
  改名实时切换。保存路径不变(仍读实时表单约束、同名调 `savePreset` = 后端覆盖更新)。

## Capabilities

### New Capabilities

<none>

### Modified Capabilities

- `lineup-filter-presets` — preset 载入/保存 UI 的行为增强:载入后名字回填 + 「存为阵型/更新「X」」文案随名切换,
  一键存回(复用既有同名更新语义)。载入 href 增带 `preset` 参数。后端与保存语义不变。

## Impact

- **前端(仅 2 文件)**:`presetLoad.ts`(`buildLoadHref` 加 `preset` 参数)、`Presets.tsx`
  (`useSearchParams` seed 名字 + 按钮文案 name-match 推导)。
- **不改后端**、不改 `savePreset`/`adminWrite`、不改 `page.tsx`/`LineupControls`(Presets 自己读 URL)。
- 无 migration、无远程前置。测试:`Presets` 组件测(载入 seed、文案切换、更新调用)+ `presetLoad` 测(href 带名)。

## Out of Scope

- 后端改动、保存语义变化(同名即更新已存在)。
- 二次确认覆盖(「更新「X」」文案已明示,且是用户自己那套)。
- preset 重命名/复制;已存阵容(saved lineups)那套的类似增强。
