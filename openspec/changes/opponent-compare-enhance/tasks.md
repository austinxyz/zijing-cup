## 1. 后端：saved_comparisons 表 + 读/写端点

### Contract
- **Spec**:
  - 系统 SHALL 提供一张 `zijing_cup.saved_comparisons` 表，按 `(season_year, division_code)` 存一条对比的**引用**：`name`、`team_a_code`、`lineup_a_id`、`team_b_code`、`lineup_b_id`、`line_notes`(JSONB)、创建/更新时间戳；`name` 在 `(season, division)` 内唯一，同名覆盖。
  - 管理员两侧都选好后 SHALL 能起名保存为一条对比；空名/超长 SHALL 拒绝。建/改/删走受保护写路由。
  - 每条线一条可覆盖的备注，存于 `line_notes` JSONB（`{line_code: text}`）；清空即删该线 key。
  - 引用阵容被删时系统 SHALL 保留该对比（不 cascade 删除）。
  - 读写 SHALL 在机密门后；只读列出端点走 backend secret；写入无管理员凭据 SHALL 被拒。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_comparisons.py -q`（需 BACKEND_SECRET/ADMIN_SECRET env）→ expected: 全绿——建/列出/同名覆盖/空名拒/超长拒/每队≤50/写备注/清备注/删除/鉴权 401·403。
- **Code**:
  - 表建在 `zijing_cup` schema；migration `set search_path` 打头、schema-qualified、`unique(season_year,division_code,name)`、`line_notes jsonb not null default '{}'`、时间戳 server_default（NOT NULL + 默认值列须 `sa_column=Column(..., server_default=..., nullable=False)`，别发显式 NULL）；本地整份一次 `execute`（断言 127.0.0.1）。
  - lineup 引用存**普通 int**、不加 on-delete-cascade 外键（D2）；team code 存字符串。
  - 写路由靠 `WRITE_METHODS` 方法判权中间件自动保护，不加前缀/依赖式鉴权；每队 ≤50（D6）超限 409；备注 key 限规则线序、value trim + 长度上限（D1）。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/opponent-compare-enhance/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — write failing pytest: 保存一条对比（四引用 + 名字）→ 库里一行；同名再存 → 覆盖不新增；空名/超长 → 拒；每队第 51 条 → 409
- [ ] 1.2 GREEN — `SavedComparison` 模型 + migration + 本地 execute；注册；建/改（同名覆盖）端点 + 名字/上限校验
- [ ] 1.3 RED — write failing pytest: 只读列出端点按赛季/组别回本组已存对比（backend secret）；无 secret → 401
- [ ] 1.4 GREEN — 只读列出端点
- [ ] 1.5 RED — write failing pytest: 写某线备注 → `line_notes[line_code]` 落值；清空 → 该 key 移除；备注端点无 admin → 403；删除对比 → 行没
- [ ] 1.6 GREEN — 写备注端点（key 限线序、trim/长度）+ 删除端点 + 鉴权透传
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：api 类型 + server actions

### Contract
- **Spec**:
  - 存的是引用而非快照——展开查看时按引用**实时重算**对比。
  - 建/改/删走受保护写路由（`adminWrite` scope `{season,division}`）。
  - 只读列出端点/取数失败或表未建时，前端 SHALL 降级为空（顶部「已存对比」为空）、页面其余照常，不得 500。
- **Runtime**: `cd frontend && npx vitest run lib` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0——`getSavedComparisons` 成功回列表 / 非 ok → `[]` / 异常 → `[]`；server actions 走 adminWrite scope + 成功 revalidate。
- **Code**:
  - `lib/api.ts` 加 `SavedComparison` 类型（含 `line_notes` map、两侧引用）+ `getSavedComparisons(season,division)`（非 ok/异常降级 `[]`，带 X-Backend-Secret）。
  - `lib/admin.ts` / compare actions：`saveComparison` / `renameComparison?` / `deleteComparison` / `setLineNote`，经 `adminWrite("POST|PATCH|DELETE", …, scope {season,division})`，成功 `revalidatePath(.../compare, "layout")`。
  - 后端枚举/字段前端收成 literal union，避免 `?? 默认` fail-open。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/opponent-compare-enhance/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — write failing vitest: `getSavedComparisons` 成功回列表（带 secret 头）；非 ok → `[]`；reject → `[]`
- [ ] 2.2 GREEN — `lib/api.ts` 类型 + `getSavedComparisons`（降级）
- [ ] 2.3 RED — write failing vitest: `saveComparison`/`deleteComparison`/`setLineNote` 经 adminWrite 正确 scope + method + body，成功 revalidate
- [ ] 2.4 GREEN — server actions（adminWrite scope、revalidatePath）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：上场预览 + 折叠卡展开 + 每线备注 UI

### Contract
- **Spec**:
  - 选一侧后系统 SHALL 在该侧 picker 下方就地显示这套阵容上场人员（姓名+性别+参赛 UTR，按线序），不必等另一侧；下拉选项带上场签名。
  - /compare 顶部 SHALL 把已存对比列为可展开/折叠卡：折叠只显示名字与两侧概要；展开就地渲染实时重算的逐线对比 + 差距 + 总和；展开 SHALL NOT 跳转/改 URL/动 picker；每卡可删。
  - 展开态逐线表每行 SHALL 有「本线备注」格供管理员就地编辑/清空；非编辑态只读；即席对比不提供备注。
  - 引用阵容被删：对比保留，展开时该侧标「阵容已删」不渲染该侧，不崩页。
  - 未解锁维持就地锁定态、不发取机密数据请求。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/compare` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0——选完一侧出 5 线名单、下拉带签名、折叠卡展开/折叠、展开就地对比、每线备注编辑/清空、阵容已删标记、未解锁不取。
- **Code**:
  - 上场预览纯前端：把选中阵容 `assignment` 按线序解析成 5 线名单（复用 `getTeamLineups().roster` 的 key→player），仿 `LineBlock` 呈现（`--color-male/--color-female` 实测 ≥4.5:1）；下拉签名取首线搭档拼串（D5）。
  - 折叠卡仿 `CollapsibleSaved`：展开态是 client 局部 state、不进 URL（D4）；展开就地复用 `compareBuild`（D3）；picker 仍用 URL。
  - 每线备注格：编辑态虚线框可改、空态「＋ 记本线备注」、只读态纯文本（空不显示）；新面板显式 `bg-surface`。
  - 阵容已删：`find` 不到 saved lineup → 该侧「阵容已删」不渲染（D2）；只读旁支取数失败降级空、自带 `error.tsx`。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/opponent-compare-enhance/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-09-28-opponent-compare-enhance-mocks.html; note tokens（surface/border/muted/warning/success/male/female）+ verbatim 文案（「已存对比」「保存对比」「本线备注」「＋ 记本线备注」「阵容已删」「上场 10 人 · 5 线」）
- [ ] 3.2 RED — write failing vitest: 选中一侧阵容 → 该侧渲染 5 线名单（姓名+性别符号+UTR，token class 断言）；下拉选项含签名
- [ ] 3.3 GREEN — 侧名单预览组件 + 下拉签名（纯前端解析）
- [ ] 3.4 RED — write failing vitest: 折叠卡默认折叠只显示名字/概要；点开就地渲染逐线对比 + 差距；再点折叠；不改 URL（断言真实行为，别断言 React 不设的属性）
- [ ] 3.5 GREEN — 折叠卡组件（`CollapsibleSaved` 范式）+ 展开态复用 compareBuild
- [ ] 3.6 RED — write failing vitest: 展开态每行可编辑本线备注、保存调 `setLineNote`、清空移除；即席对比无备注格；某侧阵容已删 → 该侧标「阵容已删」不渲染
- [ ] 3.7 GREEN — 每线备注编辑格 + 阵容已删降级 + 顶部「已存对比」区接入（未解锁不取、error.tsx）
- [ ] 3.8 VISUAL DIFF — bring up dev stack；解锁进 /compare；对照 mock（折叠卡展开态、侧名单预览、每线备注格、阵容已删态、移动竖排）；fix token/color/text 漂移
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证 + 交付

- [ ] 4.1 Run backend test suite — `backend/.venv-std/Scripts/python.exe -m pytest -q`（先跑测试，再补种——CLAUDE.md）；无回归
- [ ] 4.2 Run frontend test suite — `cd frontend && npx vitest run` + `npx tsc --noEmit`；无回归、tsc 0
- [ ] 4.3 E2E — 补种 + 起后端/前端 + 解锁：同组两队各存阵容 → 选中看 5 线名单 → 保存对比 → 顶部卡展开就地看对比 → 每线写备注/清空 → 删一侧阵容后展开标「阵容已删」；未解锁进不去
- [ ] 4.4 Run superpowers:verification-before-completion — 跑 test_commands + `npx tsc --noEmit`；`grep -rn 'console.log' frontend/app frontend/lib` 应空；migration schema-qualified；**push 读新表的后端前远程 Dashboard 建 `saved_comparisons` 的前置在交付说明点明**
