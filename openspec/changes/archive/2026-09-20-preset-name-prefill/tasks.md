## 1. buildLoadHref 载入链接携带阵型名

### Contract
- **Spec**:
  - 回填/文案是纯前端增强:载入链接 SHALL 多带一个 `preset=<名字>`(URL 编码)参数携带名字,`locks/pins/ex` 参数不变。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/presetLoad.test.ts` → expected: 新增用例全绿——`buildLoadHref` 输出含 `preset=<URL 编码名字>`,且 locks/pins/ex 参数与改前一致。
- **Code**:
  - `presetLoad.ts` `buildLoadHref`:在既有 params 上 `params.set("preset", preset.name)`(URLSearchParams 自动编码);不改 locks/pins/ex 的写法。
  - `preset` 参数只是携带名字,不进 `constraintsFromQuery`(它只认 locks/pins/ex),不影响搜索/重判。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/preset-name-prefill/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — write failing vitest(扩 presetLoad.test.ts): `buildLoadHref(base, preset{name:"主力", locks/pins/ex}, roster)` 输出含 `preset=%E4%B8%BB%E5%8A%9B`(或解码后 =主力),且 locks/pins/ex 参数不变
- [x] 1.2 GREEN — `presetLoad.ts` `buildLoadHref` 加 `params.set("preset", preset.name)`
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. Presets 载入回填名字 + 按钮文案随名切换

### Contract
- **Spec**:
  - 载入(load)一套 preset 后,「阵型名」输入框 SHALL 自动填上该 preset 的名字。「存为阵型」按钮的文案 SHALL 由**当前输入的名字是否命中某个已存 preset 名**推导:命中 → 显示「更新「<名>」」;否则 → 「存为阵型」;随用户改名实时切换。
  - 保存路径 MUST NOT 改变:仍读**实时表单**约束(`constraintsFromForm`,不读 URL),同名保存复用既有「同名即更新」语义。回填 MUST NOT 覆盖用户正在输入的字(仅在载入的 preset 名变化时 seed)。保存/更新控件仍只在编辑模式(`canEdit && editing`)出现。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/Presets.test.tsx` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0 错——URL 有 `preset=X` 时名字框初值 X;名字命中已存→按钮「更新「X」」,否则「存为阵型」;改名实时切换;「更新」调 `saveAction(live, X)`。
- **Code**:
  - `Presets`(client)用 `useSearchParams()` 读 `preset`;名字框仍受控 `useState`,用**按参数值 keyed 的 effect** seed(`useEffect(()=>{if(p)setName(p)},[p])`)——载入变名重 seed、用户打字覆盖、保存后 reset 不回灌。别改成非受控 defaultValue(CLAUDE 坑)。
  - 按钮文案 `presets.some(p=>p.name===name.trim()) ? 更新「name」: 存为阵型`;onClick 逻辑不变(读实时表单 + hasLiveConstraints 门 + `saveAction(live,trimmed)`)。
  - 空名/无约束禁用或提示(现状);仅 `showEdit` 显示(现状)。测试 mock `next/navigation` 的 `useSearchParams`。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/preset-name-prefill/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — write failing vitest(扩 Presets.test.tsx，mock useSearchParams): URL `preset=主力` → 名字框初值「主力」、按钮「更新「主力」」;无 preset → 框空、按钮「存为阵型」
- [x] 2.2 GREEN — `Presets.tsx` 加 `useSearchParams` + keyed seed effect + 文案 name-match 推导
- [x] 2.3 RED — write failing vitest: 名字框改成新名 → 按钮回「存为阵型」;命中已存名点按钮 → 调 `saveAction(live, name)`(读实时表单);用户打字后不被回灌覆盖
- [x] 2.4 GREEN — 收口文案切换 + 确保 seed effect 只按 param 变化触发(不覆盖输入)
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证 + 交付

- [x] 3.1 Run frontend test suite — `cd frontend && npx vitest run` + `cd frontend && npx tsc --noEmit`；确认无回归、tsc 0 错
- [x] 3.2 后端无改动——跳过 pytest（本 change 不碰后端）
- [x] 3.3 真机核对 — 起前端(+后端)，登录进编辑模式：载入一套阵型 → 名字框自动填该名、按钮显示「更新「X」」→ 改一个锁定 → 点「更新」→ 存回同名（后端覆盖）；改成新名 → 按钮变「存为阵型」新建。（用 useSearchParams 的 Suspense/CSR 行为一并在 `next build` 或真机确认）
- [x] 3.4 Run superpowers:verification-before-completion — `cd frontend && npx vitest run` + `npx tsc --noEmit`；`grep -rn 'console.log' frontend/app/[season]/[division]/lineup` 应空；无 migration、无后端、无远程前置
