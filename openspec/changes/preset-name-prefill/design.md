## Context

排阵页「存为阵型」(preset)载入后名字框空着,改约束想存回同一套要重打原名。后端 `save_preset` 本就「同名即
更新」——缺的只是前端把名字接上。`buildLoadHref` 现在只写 locks/pins/ex 到 URL,不带阵型名;`Presets` 是
client 组件,拿 `presets` 列表 + roster,名字框是受控 `useState("")`。

## Goals / Non-Goals

**Goals:** 载入回填名字;按钮按「当前名字是否命中已存阵型」推导「存为阵型/更新「X」」;改了约束名字仍在→仍更新;
保存仍读实时表单;仅编辑模式(现状)。
**Non-Goals:** 后端/保存语义不变;不加二次确认;不做重命名/复制;不碰 saved lineups;不改 page.tsx/LineupControls。

## Decisions

- **D1 携带名字**:`buildLoadHref` 追加 `preset=<URL 编码名字>` 参数;locks/pins/ex 不变。载入是 `router.push`
  软导航,client state 会随重渲染丢,所以名字必须走 URL 带过去。
- **D2 seed 名字框**:`Presets` 用 `useSearchParams()`(client hook)自己读 `preset` 参数——**不经
  page.tsx/LineupControls 透传**(少碰 2 文件)。名字框仍受控 `useState`;用一个**按参数值 keyed 的 effect**
  seed:`useEffect(()=>{ if(presetParam) setName(presetParam) }, [presetParam])`。载入 A→param=A→set;用户改字→
  覆盖;载入 B→param=B→重 seed;保存后 `setName("")` 不改 param,effect 不因 name 变化触发,不会回灌。
  (与 CLAUDE「非受控输入+软导航回填」坑不同:这里输入是**受控**的,keyed effect 是正解;别把它做成非受控
  defaultValue。)
- **D3 按钮文案**:`const match = presets.some(p => p.name === name.trim()); label = match ? \`更新「${name.trim()}」\` : "存为阵型"`。随 `name` 实时切换——改新名→存为阵型、改回原名→更新。保存 onClick 逻辑不变
  (读实时表单 `constraintsFromForm`、`hasLiveConstraints` 门、`saveAction(live, trimmed)`);同名即后端覆盖。
- **D4 边界**:空名/无约束仍禁用/提示(现状);仅 `showEdit`(canEdit && editing)显示(现状)。`preset` 参数不进
  `constraintsFromQuery`(它只认 locks/pins/ex),不影响搜索/重判。

## Risks / Trade-offs

- **[useSearchParams 需 Suspense]**:Next App Router 里 `useSearchParams` 要求组件在 Suspense 边界内,否则
  build 时告警/整页 CSR。`Presets` 已在排阵页深处、页面本就带边界;apply 时 `next build`(tsc + build)验证,
  真出问题就用页面已有的 constraints 传参回退(多碰 1-2 文件)。
- **[载入后再搜索丢 preset 参数]**:用户改约束点搜索,新 URL 由表单重建、不含 `preset`——但名字框已 seed、
  文案靠 name-match 仍是「更新」,不受影响。可接受。
- **[名字含特殊字符]**:URL 编码/解码走 `URLSearchParams`,自动处理。
- **[单测测不到 build/Suspense]**:vitest jsdom 无 App Router;`useSearchParams` 在测试里要 mock
  `next/navigation`。加 `npx tsc --noEmit` + 组件测(mock useSearchParams)。

## Migration Plan

无 migration、无后端、无远程前置。纯前端 2 文件。回滚=还原两文件。

## Open Questions

无。(seed=useSearchParams+keyed effect;文案=name-match;静默覆盖——均已定。)
