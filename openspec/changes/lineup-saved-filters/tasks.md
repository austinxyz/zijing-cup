## 1. 后端：preset 存储 + CRUD + 列出端点

### Contract
- **Spec**: 系统 SHALL 把每个 preset 存在 `zijing_cup` schema 的表里，按 (赛季,组别,队) 归属，持有名字与一组输入约束（锁定+排除），MUST NOT 存搜索结果或冻结 UTR。同一队内 preset 名 SHALL 唯一，同名保存 SHALL 覆盖，空名 SHALL 被拒。存与删 SHALL 是写操作、MUST 由按 HTTP 方法判权的 admin 中间件保护（无凭据被拒），列出 SHALL 只读、无需凭据；鉴权 MUST NOT 依赖路由前缀或依赖式检查。载入 SHALL 等价于把约束变成 URL query 走与手填完全相同的后端校验，preset MUST NOT 是新信任入口；名字 MUST 参数化入库。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_lineup_presets.py tests/test_admin_auth.py`（本机 uv 被 Application Control 拦，用系统 venv；CI 用 `uv run pytest`）→ expected: 存/取/删/同名覆盖/空名拒/无凭据写被拒全通过，无 import 错误
- **Code**: D1 单表 `zijing_cup.lineup_filter_presets`（`team_id` FK teams on delete cascade、`name` check 长度、`constraints` JSONB、`unique(team_id,name)`、`created_at`/`updated_at`）；同名覆盖用 `on conflict (team_id,name) do update`。SQLModel 时间戳用 `sa_column=Column(..., server_default=func.now(), nullable=False)`，别写 `Optional=None`（否则插显式 NULL 抛错）。D5 存/删是 POST/DELETE 自动受 `WRITE_METHODS` 保护，不加前缀判权、不用依赖式鉴权。D4 name ≤60、每队 ≤50。远程迁移走 Dashboard，本地打本地栈（断言连接串含 127.0.0.1）。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/lineup-saved-filters/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — pytest：迁移 SQL 打到本地栈后，存一个 preset（team + name + constraints JSON），断言能按 (队) 列出、内容一致
- [ ] 1.2 GREEN — 写 migration `zijing_cup.lineup_filter_presets`（打到本地栈）；`app/lineups/presets.py` 模型 + 存命令 + 列出查询；接线到 query/command 层
- [ ] 1.3 RED — pytest：同名再存断言覆盖（队内该名仍 1 条、内容为新）；空名断言被拒
- [ ] 1.4 GREEN — 存命令用 `on conflict (team_id,name) do update`；空名校验拒绝
- [ ] 1.5 RED — pytest：删一个 preset 断言列表里没了；删不存在的 id 优雅处理
- [ ] 1.6 GREEN — 删命令
- [ ] 1.7 RED — pytest：路由层——GET 列出无需凭据返回；POST 存 / DELETE 删 无 admin 凭据被拒（沿用 `test_admin_auth.py` 全应用断言：每条写路由拒无凭据）
- [ ] 1.8 GREEN — 路由 `routers/lineups.py`：GET 列出 + POST 存 + DELETE 删（写路由靠方法自动受保护，不加前缀、不用依赖式鉴权）
- [ ] 1.9 RED — pytest：name > 60 或每队 > 50 断言被拒
- [ ] 1.10 GREEN — 长度/数量上限校验（DB check + 命令层）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：已存阵型块（列表/保存/载入/失效）

### Contract
- **Spec**: 排阵页 SHALL 列出该队所有 preset（名 + 规模），载入 SHALL 把锁定/排除写回 URL 参数、页面据此重渲染、结果与手填一致，列出/载入 MUST NOT 需登录。SHALL 只对管理员显示存/删入口，至少一条约束才可存、空约束 MUST NOT 可存，非管理员 SHALL 只见列表+载入。载入 preset 的**锁定**引用了已不在 `search.roster` 的球员时页面 SHALL 明说过期、指出失效的锁与人、给删/重建入口，MUST NOT 静默应用剩余、MUST NOT 呈现看似健康的候选列表、MUST NOT 猜替补；只有**排除**引用离队球员时 SHALL 照常载入，MAY 中性提示。面板 SHALL 对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: preset 列表/载入/保存入口门控/失效面板（锁定拒载、排除照常）新测试通过、既有 lineup 测试无回归
- **Code**: D2 失效检查前端比对 `search.roster`：锁定任一位不在→拒载面板，排除不在→静默丢/中性提示。D3 载入=链接/导航写回 query（保持 URL 唯一记录、可分享），存/删走 `lib/admin.ts` server action（in-app 浏览器 `requestSubmit()`）。`lib/api.ts` 加列出类型+fetch。用设计 token（warning 拒载面板、中性档提示、primary 载入、danger 删除），不硬编码 hex。admin 门控只是表层，写权限由后端方法判权。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-saved-filters/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-02-lineup-saved-filters-mocks.html; note linear tokens (primary 载入、danger 删除/失效、warning 拒载面板、中性档 muted-fg/surface-muted) 与逐字串（「已存阵型」「存为阵型」「这个阵型已过期」「按现有名单重建」等）
- [ ] 2.2 RED — vitest：给控件传一组 preset，断言渲染名+规模+载入；admin 态见存/删、非 admin 态不见；空约束时保存入口禁用
- [ ] 2.3 RED — vitest：载入锁定引用不在 roster 的 preset → 断言拒载面板（明说+失效锁与人+删/重建），不渲染候选；排除引用离队球员 → 断言照常载入路径 + 中性提示
- [ ] 2.4 GREEN — `lib/api.ts` 列出类型/fetch；`lib/admin.ts` 存/删 action；控件里 preset 块 + 载入（写回 URL）+ 失效面板；token 化
- [ ] 2.5 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`); admin 登录（`requestSubmit()`）造 preset，桌面 + 375 对照 mock，量 computed style 确认对比度 ≥4.5、无横向溢出、44px 目标；fix drift
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与交付

- [ ] 3.1 Run backend test suite — `cd backend && uv run pytest`（本机用 `backend/.venv-std/Scripts/python.exe -m pytest`）确保无回归
- [ ] 3.2 Run frontend test suite — `cd frontend && npm run test` 确保无回归
- [ ] 3.3 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [ ] 3.4 Run superpowers:verification-before-completion — 跑 test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config 的 custom_verification_checks；补种前不再跑 pytest（先测试→补种→视觉核对）；远程迁移记得去 Dashboard 手动执行
