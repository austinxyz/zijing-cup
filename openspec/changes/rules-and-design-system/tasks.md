## 1. 设计系统 token 与基础组件

### Contract
- **Spec**: 前端 SHALL 在 `globals.css` 中以 CSS 自定义属性定义配色、圆角与字体 token，并提供 Button / Card / Badge / Input 四个基础组件。所有页面 MUST 通过这些 token 与组件取得视觉样式，MUST NOT 在页面中硬编码颜色值。引入这套设计系统 MUST NOT 新增任何运行时依赖。
- **Runtime**: `cd frontend && npm run test` → expected: 组件与 token 相关测试全部通过，无 TypeScript 报错
- **Code**:
  - token 数值逐项取自 `ai-course-management/frontend/app/globals.css`，不取整、不凭印象（design.md「设计系统抄错数值」风险项）
  - `cn` 是手写的 4 行实现，不引入 clsx / tailwind-merge；Tailwind v4 用 `@theme inline` 暴露 token
  - 组件 API 与 ai-course-management 保持一致：Button 有 primary/secondary/ghost/danger × sm/md
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/rules-and-design-system/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — vitest：断言 Button 各变体渲染出对应 token class（`wrapper.classes()` 匹配 `bg-primary` / `bg-surface-muted` / `bg-danger`），当前必然失败
- [x] 1.2 GREEN — 移植 `frontend/app/globals.css` 的 token 块（`:root` 变量 + `@theme inline` 映射）与 `frontend/lib/cn.ts`，实现 `components/ui/button.tsx`
- [x] 1.3 RED — vitest：断言 Card / CardHeader / CardTitle / CardDescription、Badge 五个变体、Input 的 token class 与结构
- [x] 1.4 GREEN — 实现 `components/ui/{card,badge,input}.tsx` 与 `components/ui/index.ts` 导出
- [x] 1.5 在 `app/layout.tsx` 接入 next/font 的 Noto Sans SC 与 JetBrains Mono，绑定到 `--font-sans` / `--font-mono`
- [x] 1.6 校验未新增运行时依赖：`git diff frontend/package.json` 的 dependencies 段无新增条目
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 赛制规则数据模型与 migration

### Contract
- **Spec**: 系统 SHALL 将各线 UTR Cap、Buffer 额度、各线分值、上场资格阈值与胜负判定方式，以 `(赛季, 组别)` 为维度存储为数据。这些值 MUST NOT 以代码常量的形式出现在后端或前端源码中。 / 系统 SHALL 允许一条线没有 UTR 上限（金组的 D1 与 MD）。无上限 MUST 表达为「不存在上限」（cap 为 null），MUST NOT 用一个足够大的数值代替。 / 系统 SHALL 同时存储 Buffer 的「单线最大超出量」与「全队超出量总额」两个额度。 / 系统 SHALL 将上场资格限制存储为一组规则，每条包含性别、UTR 阈值、人数上限，以及可选的线位白名单。 / 系统 SHALL 存储每个组别的胜负判定方式，区分「按胜场数」与「按加权分」两种。
- **Runtime**: `cd backend && uv run pytest tests/test_rules_model.py` → expected: 模型与 schema 归属测试全部通过
- **Code**:
  - 四张表（seasons / divisions / division_lines / division_eligibility_limits），不用 JSONB —— `cap IS NULL` 与线位白名单要能被 schema 表达和查询（design.md D1）
  - `buffer_per_line` 与 `buffer_total` 分两列存，不合并 —— 规则原文是两条独立约束
  - migration 首行 `set search_path to zijing_cup, public;`；`postgres` 角色默认 search_path 不含 `zijing_cup`，无限定 DDL 会静默落到 `public`（对方应用的 schema）
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/rules-and-design-system/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — pytest：断言四张表存在且全部位于 `zijing_cup` schema、`public` 中不存在同名表（查 `information_schema.tables`），当前必然失败
- [ ] 2.2 GREEN — 新增 `supabase/migrations/<timestamp>_create_competition_rules.sql`，建四张表、外键与唯一索引（`divisions(season_year, code)`、`division_lines(division_id, code)`），首行设置 search_path
- [ ] 2.3 RED — pytest：断言 `division_lines.cap` 可为 NULL、`division_eligibility_limits.restricted_to_lines` 可为 NULL 且能存多个线位代码
- [ ] 2.4 GREEN — 实现 `backend/app/models/rules.py` 的 SQLModel 定义，字段可空性与 migration 一致
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. TOML seed 与幂等导入命令

### Contract
- **Spec**: 系统 SHALL 提供一条导入命令，把 TOML seed 文件的内容写入数据库。该命令 MUST 是幂等的：在同一份 seed 文件上重复执行，数据库最终状态一致，且不产生重复记录。 / 导入命令 SHALL 提供 `--check` 模式：只比对数据库与 seed 文件，不做任何写入。一致时以退出码 0 结束；不一致时以非零退出码结束，并指出存在差异的赛季、组别与字段。
- **Runtime**: `cd backend && uv run pytest tests/test_seed_rules.py` → expected: 幂等、漂移检测、check 不写库三类测试全部通过
- **Code**:
  - 实现分三步：解析 seed → 读 DB 当前状态 → 计算差异；`--check` 与写入模式**共用同一个比对函数**，否则会出现「check 说一致、导入却写了东西」（design.md D3）
  - 不用 `ON CONFLICT DO UPDATE` 无脑覆盖 —— 那样无法回答「有没有变」，`--check` 得另写一套逻辑
  - seed 中不存在但 DB 中存在的行按删除处理，使 seed 成为唯一事实来源；删除前打印将删除的行数与内容
  - TOML 用标准库 `tomllib` 读取，不新增依赖
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/rules-and-design-system/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 编写 `backend/seeds/rules/{2025,2026}-{gold,silver}.toml` 四个文件，每条 Cap / Buffer / 阈值旁以注释标注规则原文出处（依据 `docs/domain/rules.md`）
- [ ] 3.2 RED — pytest：空库导入后四套规则落库，且 2026 银组五线 cap 为 13/12/11/10.25/9.25、2026 金组 D1 与 MD 的 cap 为 NULL、2025 两组 buffer 为 0
- [ ] 3.3 GREEN — 实现 `backend/app/seeds/load_rules.py`：解析 → 读 DB → 比对 → 写入
- [ ] 3.4 RED — pytest：同一 seed 连续导入两次，第二次后数据与第一次完全一致且无重复行；改一条 cap 后重新导入，该条更新且其余不变
- [ ] 3.5 GREEN — 补齐幂等与差异写入逻辑（含删除语义）
- [ ] 3.6 RED — pytest：`--check` 在一致时退出码 0；改 seed 未导入时退出码非 0 且输出含赛季/组别/字段；`--check` 执行后 DB 数据未变
- [ ] 3.7 GREEN — 实现 `--check` 模式，复用 3.3 的比对函数
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 规则查询端点

### Contract
- **Spec**: 后端 SHALL 提供 `GET /api/seasons/{year}/divisions/{code}/rules`，返回该赛季该组别的完整规则（线定义、Buffer、资格限制、胜负判定方式、通用阵容约束）。系统 MUST NOT 提供任何修改规则的 HTTP 端点。
- **Runtime**: `cd backend && uv run pytest tests/test_rules_api.py` → expected: 200 与两类 404 路径测试全部通过
- **Code**:
  - 一次取出组别 + 线 + 资格限制并组装为一个响应体，不做 N+1（design.md D4）
  - 规则数据量小且几乎不变，本次**不加缓存** —— 过早缓存会掩盖链路问题
  - 只读：不新增任何写入端点；路由仍在既有的 `X-Backend-Secret` 中间件之后
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/rules-and-design-system/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — pytest：`/api/seasons/2026/divisions/silver/rules` 返回 200 且响应含五线定义、buffer 两个额度、资格限制与 scoring_mode；未知赛季与未知组别代码均返回 404
- [ ] 4.2 GREEN — 实现 `backend/app/rules.py` 的查询组装与 `backend/app/routers/rules.py` 的路由，并在 `main.py` 注册
- [ ] 4.3 RED — pytest：断言应用路由表中不存在任何指向规则资源的写方法（POST/PUT/PATCH/DELETE）
- [ ] 4.4 GREEN — 如有必要收紧路由定义，使 4.3 通过
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 应用壳与赛制规则页

### Contract
- **Spec**: 前端 SHALL 提供一个所有数据页面共用的应用壳，含固定宽度的深色侧栏与导航项。尚未实现的导航项 MUST 呈现为禁用态并标注未开放，MUST NOT 呈现为可点击但导向空白或报错页面的链接。 / 应用 SHALL 以 URL 路径段表达当前赛季与组别（形如 `/2026/silver/rules`）。赛季与组别 MUST NOT 存放于 cookie、query string 或客户端状态。切换器 SHALL 是单一控件，一次同时选定赛季与组别。 / 前端 SHALL 只在服务端读取 `BACKEND_URL` 与 `BACKEND_SECRET`，并统一经 `lib/api.ts` 调用后端。 / 前端 SHALL 在 `/{season}/{division}/rules` 展示该赛季该组别的完整规则，数据经由 Server Component 从后端取得。 / 赛制规则页面 SHALL 在同组别存在上一赛季规则时，标注本赛季相对上一赛季发生变化的项。
- **Runtime**: `cd frontend && npm run test` → expected: 壳、切换器链接、规则页渲染与错误态测试全部通过
- **Code**:
  - 壳放在 `app/[season]/[division]/layout.tsx`，**不要放进页面内部** —— `error.tsx` / `loading.tsx` 替换的是其下方内容，壳在页面里会导致一次取数失败清空整个窗口（design.md D5，ai-course-management 踩过）
  - 切换器选项是链接（替换路径中的 season/division 段），不是客户端状态
  - 「较上一赛季」在前端比对：页面额外请求一次上一赛季规则，上一赛季不存在时不显示对比且不报错（design.md D6）
  - 组别代码 URL 用 `gold`/`silver`，展示名取自数据库 `display_name`
- **Threshold**: 70

- [ ] 5.0 CONTRACT — write openspec/changes/rules-and-design-system/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-27-rules-and-design-system-mocks.html#desktop` 与 `#mobile`；记录 token（sidebar `#1c1b18`、primary `#9c3417`、border `#e4e0d8`、radius 0.5rem、侧栏 216px、表行 40px）与逐字文案（「赛制规则」「未开放」「2026 · 银组」「共享预算，不是每线容差」）
- [ ] 5.2 RED — vitest：壳渲染时「队伍」「分析」为禁用态且不是链接、「赛制规则」为选中态；切换器目标链接为替换 season/division 段后的路径；断言 token class 出现在 `wrapper.classes()`
- [ ] 5.3 GREEN — 实现 `app/[season]/[division]/layout.tsx` 与侧栏、切换器组件
- [ ] 5.4 VISUAL DIFF — 起 dev stack（`npm run dev --prefix frontend`），访问 `/2026/silver/rules`，对照 mock 的 `#desktop` 逐项比对配色、间距与文案；再切到移动视口对照 `#mobile`；修正漂移
- [ ] 5.5 RED — vitest：规则页展示五线 cap；金组页 D1/MD 显示为开放线而非数值且显示分值；2026 银组页 MD/WD 标注相对 2025 的变化、D1/D2/D3 标注未变；2025 页（无上一赛季数据）正常渲染且无对比标注
- [ ] 5.6 GREEN — 在 `lib/api.ts` 新增规则查询函数（保持单一出口），实现 `app/[season]/[division]/rules/page.tsx`
- [ ] 5.7 RED — vitest：后端不可达时规则页呈现错误态且壳仍渲染
- [ ] 5.8 GREEN — 实现 `app/[season]/[division]/rules/error.tsx`，并把 `app/page.tsx` 改为重定向到库中最新赛季的银组规则页
- [ ] 5.9 VISUAL DIFF — 再次对照 mock 检查规则页正文（各线表格、Buffer 卡片的共享预算说明、资格限制、参赛 UTR 三类来源徽章），修正漂移
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 验证与收尾

- [ ] 6.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 6.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 6.3 e2e 不适用（`project.e2e_command` 为空），跳过并在此注明
- [ ] 6.4 执行 `python -m app.seeds.load_rules --check`，确认 DB 与 seed 一致（退出码 0）
- [ ] 6.5 Run superpowers:verification-before-completion —— 跑 `project.test_commands`；跑 `project.custom_verification_checks`（前端 console.log 扫描、敏感变量泄漏扫描、migration 的 `zijing_cup` 限定检查）
