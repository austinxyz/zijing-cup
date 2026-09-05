# Tasks — scoped-admin-auth

Test runner note: 本机 `uv run` 被 Application Control 拦，后端命令走
`backend/.venv-std/Scripts/python.exe -m pytest ...`（见 CLAUDE.md）。写测试需
`BACKEND_SECRET`/`ADMIN_SECRET` 前缀（纯模块先 import app 会让密钥 None → 403/401 假阳性）。

## 1. admin_credentials 表 + 后端 GET/PUT

### Contract
- **Spec**: (admin-credentials) 系统 SHALL 有一张 `admin_credentials` 表（`season_year`、
  `division_code`、`password_hash`、`updated_at`，`(season_year, division_code)` 唯一），后端只存/回
  字符串、MUST NOT 算或校验密码。系统 SHALL 提供 GET 读该比赛 hash（无行 404，需 `X-Backend-Secret`）
  与 PUT upsert（写方法，另需 `X-Admin-Secret`，按方法判权自动覆盖）。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_admin_credentials.py backend/tests/test_admin_auth.py -q` → expected:
  表/唯一约束、GET 读/404、PUT upsert、无 X-Backend-Secret→401、无 X-Admin-Secret→403，全绿。
- **Code**: D5 —— `AdminCredential` 模型（表 `admin_credentials`、唯一 (season,division)、
  `password_hash text`、`updated_at` server_default）；GET/PUT 路由；`auth.py` **不动**（中间件已覆盖）；
  migration `set search_path to zijing_cup` 开头、无 FK（密码行可先于 division）、本地打 127.0.0.1。
  后端绝不算 hash。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/scoped-admin-auth/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 RED — test: 模型/表存在、`(season,division)` 唯一、`password_hash` 非空（backend/tests/test_admin_credentials.py，打本地库）
- [x] 1.2 GREEN — `app/models/` 加 `AdminCredential`；写 migration；本地断言 127.0.0.1 后打本地栈
- [x] 1.3 RED — test: PUT upsert 后 GET 返回同一 hash；无行 GET 404；同 (season,division) PUT 两次是更新非新增
- [x] 1.4 GREEN — GET/PUT 路由（读 hash/404、upsert）
- [x] 1.5 RED — test: GET 无 `X-Backend-Secret`→401；PUT 无 `X-Admin-Secret`→403（test_admin_auth 那条全应用范围断言覆盖到新写路由）
- [x] 1.6 GREEN — 确认中间件覆盖（应无需改 auth.py；若断言红再查）
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 2. 会话 scope + 按比赛认证（auth 核心）

### Contract
- **Spec**: (admin-access) 会话 SHALL 携带 `scope`（`"*"` 或 `"<season>:<division>"`），进 **HMAC 签名
  载荷**，篡改即签名失效。`authenticate(season, division, password)` SHALL 先比 super（现有
  `ADMIN_PASSWORD_HASH`）→ scope `"*"`；否则取该比赛 DB hash 比 → scope `"<season>:<division>"`；
  皆不中失败（沿用限速/反馈/失败关闭）。hash 只在 Next 侧算/比，明文 MUST NOT 到后端。无密码行的
  比赛 SHALL 只有 super 能解锁。
- **Runtime**: `cd frontend && npx vitest run lib/session.test.ts app/login` (+ `npx tsc --noEmit`) → expected:
  scope 往返签名、篡改作废、authenticate 三分支、无行只 super、读 hash 失败降级 false，全绿。
- **Code**: D1 —— `Session.scope`；`issueSession(scope)`/`readSession` 进出签名载荷；scope 取值 `"*"`
  或 `` `${season}:${division}` ``。D2/D3 —— 抽 `matches(hash,password)` 复用；`checkCompetitionPassword`
  走后端 GET（`X-Backend-Secret`，404/失败→false）；`authenticate` 三分支，限速在比对前。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/scoped-admin-auth/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — test: `issueSession("2026:silver")` → `readSession` 得回该 scope；改载荷里的 scope 再验签 → null（lib/session.test.ts）
- [x] 2.2 GREEN — `Session.scope` + `issueSession(scope)` + `readSession` 解出 scope（签名覆盖 scope）
- [x] 2.3 RED — test: `matches(hash,pwd)` 抽出后 super 与比赛两路一致；`checkCompetitionPassword` 命中/未命中/404→false/读错→false
- [x] 2.4 GREEN — 抽 `matches`；`checkCompetitionPassword`（后端 GET + 比对 + 失败降级）
- [x] 2.5 RED — test: `authenticate` super→`"*"`、比赛命中→`"season:division"`、无行/错密码→失败；限速在比对前（login/actions 测试或抽出的核心）
- [x] 2.6 GREEN — `authenticate(season,division,password)` 三分支；`login`/`unlockAdmin` 传 season/division（super `/login` 无比赛上下文时只认 super）
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 3. canEdit(比赛) + adminWrite 越权拒 + 各取值点接线

### Contract
- **Spec**: (admin-access) 系统 SHALL 提供 `canEdit(season, division)`（`scope==="*" || scope===该比赛`）
  取代全局判据，所有「能否编辑」取值点改按比赛判。`adminWrite` SHALL 收目标比赛、发请求前校验 scope
  覆盖，盖不住 SHALL 抛错且 MUST NOT 发带 `X-Admin-Secret` 的请求。
- **Runtime**: `cd frontend && npx vitest run lib/admin.test.ts app/[season]/[division]` (+ `npx tsc --noEmit`) → expected:
  canEdit 按比赛真假、adminWrite 越权抛错不发请求、作用域内照发、各页/控件按比赛显隐，全绿；tsc 干净。
- **Code**: D4 —— `canEdit(season,division)`；`adminWrite` 新增显式 `scope` 参数（不解析 path），
  `assertScope` 覆盖不了抛 `NotAuthorizedForCompetition` 不发；各写 server action 把绑定的
  (season,division) 传下去；layout/teams/lineup/saved/players 的 `canEdit` 调用改按比赛；就地解锁表单
  带 season/division 隐藏字段。
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/scoped-admin-auth/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — test: `canEdit` scope `2026:silver` → (2026,silver) 真、(2026,gold)/(2025,silver) 假；`"*"` 全真（lib/admin.test.ts，mock 会话）
- [x] 3.2 GREEN — `canEdit(season,division)`；各页取值点改按比赛（layout、teams/[code]、lineup/[code]、lineup/[code]/saved、players layout）
- [x] 3.3 RED — test: `adminWrite` scope 盖不住目标比赛 → 抛错、`fetch` 未被调用；覆盖时照发双密钥（mock fetch）
- [x] 3.4 GREEN — `adminWrite` 显式 scope 参数 + `assertScope`；写 server action 传 (season,division)；解锁表单加隐藏字段
- [x] 3.5 RED — test: 就地解锁表单渲染出 season/division 隐藏字段（值正确）——`EditModeToggle`/两个 HeaderControl
- [x] 3.6 GREEN — 表单加隐藏 season/division，接 `unlockAdmin`
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 4. super 专属改密码页

### Contract
- **Spec**: (admin-credentials) 系统 SHALL 提供仅 super 可用的改密码页：选赛季/组别 + 输新密码 →
  server action 先校验 scope `"*"` → Next 侧算 hash → PUT 写 `admin_credentials`。非 super SHALL 打不开
  且 server action MUST 拒绝执行、不发 PUT。写入后该比赛旧密码立即失效。
- **Runtime**: `cd frontend && npx vitest run app/admin app/login` (+ `npx tsc --noEmit`) → expected:
  非 super 页不渲染表单/action 拒绝、super 写调用 hash + PUT("super-only")，全绿；tsc 干净。
- **Code**: D6 —— 新 super-only 页（server 组件先 `isSignedIn()` 且 scope `"*"` 才渲染表单）；
  `setCompetitionPassword(season,division,password)` server action：断言 scope `"*"`（否则抛、不写）→
  `hashPassword` → `adminWrite("PUT", ".../admin-credential", {password_hash}, "super-only")`。
- **Threshold**: 80

- [x] 4.0 CONTRACT — write openspec/changes/scoped-admin-auth/contracts/group-4.md with the ### Contract block above
- [x] 4.1 RED — test: `setCompetitionPassword` scope 非 `"*"` → 抛错、`adminWrite` 未调用；scope `"*"` → 调 hashPassword + adminWrite PUT（mock）
- [x] 4.2 GREEN — `setCompetitionPassword` server action（super 门 + Next 侧 hash + PUT super-only）
- [x] 4.3 RED — test: super 页非 super 会话不渲染表单（显示提示）；super 会话渲染选择器 + 密码输入
- [x] 4.4 GREEN — super-only 改密码页（server 组件 scope 门 + 表单）
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 5. 验证

- [ ] 5.1 Run superpowers:verification-before-completion — 后端 pytest（`.venv-std` + 双密钥）+ 前端
  `npm run test` + `npx tsc --noEmit`；审计无 console.log；`curl` GET/PUT admin-credential 确认落库；
  真渲染核对：2026 银组密码解锁只改银组、super 全改、super 改密码页非 super 打不开。顺序固定：
  先测试 → 再补种 → 再视觉核对（跑完 pytest 本地库会空）。super 页登录用 `ADMIN_PASSWORD_HASH`（临时
  写一个已知明文 hash 进 `.env.local` 并重启 dev，验完还原）。
