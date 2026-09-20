## Contract — Group 2: Presets 载入回填名字 + 按钮文案随名切换

- **Spec**:
  - 载入(load)一套 preset 后,「阵型名」输入框 SHALL 自动填上该 preset 的名字。「存为阵型」按钮的文案 SHALL 由**当前输入的名字是否命中某个已存 preset 名**推导:命中 → 显示「更新「<名>」」;否则 → 「存为阵型」;随用户改名实时切换。
  - 保存路径 MUST NOT 改变:仍读**实时表单**约束(`constraintsFromForm`,不读 URL),同名保存复用既有「同名即更新」语义。回填 MUST NOT 覆盖用户正在输入的字(仅在载入的 preset 名变化时 seed)。保存/更新控件仍只在编辑模式(`canEdit && editing`)出现。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/Presets.test.tsx` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0 错——URL 有 `preset=X` 时名字框初值 X;名字命中已存→按钮「更新「X」」,否则「存为阵型」;改名实时切换;「更新」调 `saveAction(live, X)`。
- **Code**:
  - `Presets`(client)用 `useSearchParams()` 读 `preset`;名字框仍受控 `useState`,用**按参数值 keyed 的 effect** seed(`useEffect(()=>{if(p)setName(p)},[p])`)——载入变名重 seed、用户打字覆盖、保存后 reset 不回灌。别改成非受控 defaultValue(CLAUDE 坑)。
  - 按钮文案 `presets.some(p=>p.name===name.trim()) ? 更新「name」: 存为阵型`;onClick 逻辑不变(读实时表单 + hasLiveConstraints 门 + `saveAction(live,trimmed)`)。
  - 空名/无约束禁用或提示(现状);仅 `showEdit` 显示(现状)。测试 mock `next/navigation` 的 `useSearchParams`。
- **Threshold**: 80
