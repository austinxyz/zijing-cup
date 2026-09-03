## 1. 后端：引擎 pin + 冲突校验 + pin 感知诊断

### Contract
- **Spec**: 系统 SHALL 支持单座位 pin——把一名队员钉在一条具体线，引擎只在**含被钉者的合法对**里为该线选搭档、排满其余、总和最大，被钉者 MUST NOT 出现在其它线；硬锁整对语义不变；pin/硬锁/排除可组合；女将可钉男双、MD/WD 的 pin 性别由既有每线判定负责。系统 MUST 拒绝矛盾输入（同一人钉两线 / pin 与排除同指一人 / pin 与硬锁成员同指一人 / 一线两座同一人）返回 4xx。被钉线无解时 SHALL 点名被钉者与线，诊断只在含被钉者的对里按四类原因给出，MUST NOT 报无关的整池「本可行」原因，MUST NOT 触发第二次整解搜索。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_lineup_search.py tests/test_lineup_infeasibility.py tests/test_lineup_api.py`（本机 uv 被 Application Control 拦，用系统 venv；CI 用 `uv run pytest`）→ expected: pin 单/多线可解、被钉者不现于它线、冲突各类被拒、pin 无解诊断限定含 pin 的对、既有 lineup 测试无回归
- **Code**: D2 `search_lineups` 加 `pins: dict[str,Candidate]`；`committed` 含被钉者、搭档不预剔；被钉线 `options[L]=[pair for pair in legal_pairs(available+[pin]) if pin in pair]`，strongest-first 与 scarcest-first 不变。D3 `diagnose_line` 加 `pinned: Optional[str]`，非 None 时 `combinations` 只遍历含被钉者的对、message 点名 X+L；search 在被钉线 options 空时以 `pinned=pin` 调它。D4 冲突校验放 `search_team_lineups`（与既有 key 解析同处、抛 `UnknownReference`→422）；路由 `_reject_old_keys` 也扫 pin key。编码 `pin=LINE:key`，不重载 `lock=`。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/lineup-single-pin/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — pytest：`search_lineups` 传 `pins={"MD": cand}`，断言结果 MD 含该被钉者 + 一名合法搭档、被钉者不现于其它线（用手造小 roster）
- [x] 1.2 GREEN — `search_lineups` 加 `pins` 参数：`committed` 并入被钉者，被钉线 `options[L]` 过滤到含 pin 的合法对；递归/排序不变
- [x] 1.3 RED — pytest：多线 pin 联合可解，断言每个 pin 都被满足、各被钉者只在其线
- [x] 1.4 GREEN — 确认多 pin 正确（committed 汇总所有被钉者；每条被钉线各自过滤）
- [x] 1.5 RED — pytest：被钉者在该线配不出合法搭档（如都超差距）→ 断言 `infeasible_line==L`、`infeasibility` 点名被钉者、原因 kind 属四类之一且来自含 pin 的对；另断言不含无关「本可行」原因
- [x] 1.6 GREEN — `diagnose_line` 加 `pinned` 参数，含被钉者的对上跑四关分类 + message 点名；`search` 被钉线空时以 `pinned` 调用
- [x] 1.7 RED — pytest（API/query 层）：`pin=LINE:key` 参数被解析并生效；冲突各类（同一人钉两线 / pin∩排除 / pin∩硬锁成员 / 一线两座同人）各返回 4xx；未知 pin key 4xx
- [x] 1.8 GREEN — 路由 `pin` query 参数 + 解析；`search_team_lineups` 解析 pin key 成 Candidate、校验四类冲突抛 `UnknownReference`；`_reject_old_keys` 扫 pin key；透传 `pins` 给引擎
- [x] 1.9 RED — pytest：女将钉男双线 → 断言引擎为她配出合法男双搭档（女性可填男双座位）
- [x] 1.10 GREEN — 确认（既有性别判定已允许；补齐若有缺）
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：半填=pin 三态呈现 + pin 无解面板

### Contract
- **Spec**: 控件一条线 SHALL 按已填座位数呈现三态：一个=pin（「已钉」标识 + 「搭档交给引擎」小字）、两个=硬锁整对、零=交给引擎，三者可辨，半填 MUST NOT 看起来被忽略。pin SHALL 编码进可分享 URL、直接访问重现同一约束。pin 使某线无解时面板 SHALL 点名被钉者与线、呈现含被钉者对的原因，取代光秃秃一句，MUST NOT 猜替补。面板对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: 三态渲染/pin URL 编码/pin 无解面板新测试通过、既有 lineup 测试无回归
- **Code**: D1 `constraintsFromQuery` 分出 `{locks, pins, excluded}`：恰好一座位=pin、两座位=lock、两座同人=非法（不发约束）。`lib/api.ts` 的 `LineupConstraints` 加 `pins`，query 构造发 `pin=LINE:key`。D5 控件按每线座位数渲染三态（mock：pin warning 描边 `#c9a24a` + warning 角标 + 小字；硬锁 primary 描边 + 角标），用设计 token 不硬编码。pin 无解复用 `NoSolution`，读带 pin 点名的 `infeasibility`。pin/锁/排任一非空即「有约束」→ baseline 并发照跑。前端不做数值比较。
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/lineup-single-pin/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-02-lineup-single-pin-mocks.html; note linear tokens (pin warning `#8a6508`/`#fbf5e6`/`#ecd9a4`、硬锁 primary `#9c3417`、中性 `#6b665d`) 与逐字串（「已钉」「搭档交给引擎」「锁整对」「凑不出合法阵容」「因为 pin」）
- [x] 2.2 RED — vitest：`constraintsFromQuery` 对「一线一座位」返回 pins、「一线两座位」返回 locks、「两座同人」不产约束；`lib/api.ts` 把 pins 编码成 `pin=LINE:key`
- [x] 2.3 RED — vitest：控件对 pin 线渲染「已钉」标识 + 「搭档交给引擎」小字 + warning token，对硬锁线渲染 primary「锁整对」，空线两者都无；三态可辨
- [x] 2.4 RED — vitest：`NoSolution` 传带 pin 点名的 `infeasibility`（reason message 含「因为 pin」/被钉者/线），断言渲染点名与原因、不猜替补
- [x] 2.5 GREEN — `constraintsFromQuery` 三态；`lib/api.ts` pins 编码；控件三态渲染（token 化）；pin 无解经既有 `NoSolution`
- [x] 2.6 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`); 造 pin 场景（ZJU-USC 每线一人）+ pin 无解场景导航到排阵页; 桌面 + 375 对照 mock; 量 computed style 确认对比度 ≥4.5、无横向溢出、44px; fix drift
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与交付

- [x] 3.1 Run backend test suite — `cd backend && uv run pytest`（本机用 `backend/.venv-std/Scripts/python.exe -m pytest`）确保无回归
- [x] 3.2 Run frontend test suite — `cd frontend && npm run test` 确保无回归
- [x] 3.3 `cd frontend && npx tsc --noEmit` — 类型检查（vitest 不校验类型，单列必跑）
- [x] 3.4 Run superpowers:verification-before-completion — 跑 test_commands + tsc + `grep -rn console.log frontend/app frontend/lib` + config 的 custom_verification_checks；补种前不再跑 pytest（先测试→补种→视觉核对）
