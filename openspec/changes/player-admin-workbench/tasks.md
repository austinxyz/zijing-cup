# Tasks — player-admin-workbench

## 1. 后端：list_players / count_players 加 gender / team / year 筛选

### Contract
- **Spec**: player-registry —— 「`list_players` 与 `count_players` SHALL 在现有 `q`、`season`、`team_id`、`unresolved` 之外，额外支持三个筛选维度，多维度以 AND 组合：`gender` 精确匹配 `Player.gender`；`team` 模糊 ilike 同时匹配 `Team.code` 与 `Team.display_name`（命中任一）；`year` 命中「该年有 `PlayerSeasonUtr` 或该年在某队名单」两者任一」；「`count_players` 的计数 SHALL 与 `list_players` 用同一套筛选，返回不受页上限影响的真实总数」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "player and (query or list or filter or count)"` → expected: 新筛选的单测全过、无 import 错（本机 uv 被 Application Control 拦，用 .venv-std 的签名解释器；CI 仍走 config 的 uv）。
- **Code**: `_filtered` 加 `gender`/`team`/`year` 三参数；`year` 用 `Player.id.in_(子查询 PlayerSeasonUtr) | Player.id.in_(子查询 membership-join-Team)` 的 OR，**不**并进 team 的 INNER join（否则变「该队且该年」而非任一）；`team` 模糊 join Team 后 `Team.code.ilike | Team.display_name.ilike`；`list_players` 仍按 id 去重；`count_players` 复用同一 `_filtered`。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/player-admin-workbench/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 RED — `tests/players/` 加测：`list_players(gender="F")` 只返回女；`gender` 精确。断言失败（参数未支持）
- [x] 1.2 GREEN — `_filtered` 加 `gender` 参数 + `list_players`/`count_players` 透传
- [x] 1.3 RED — 测 `team="北大"` 模糊命中 `Team.code`/`display_name`（造一支 display_name 含「北大」的队）；`team` 未支持时失败
- [x] 1.4 GREEN — `_filtered` 加 `team` 模糊（join Team + code/display_name ilike）
- [x] 1.5 RED — 测 `year=Y` 任一命中：只有该年 season_utr 的人、只有该年 membership 的人，都入选；只有别年的不入选
- [x] 1.6 GREEN — `_filtered` 加 `year`（两子查询 id.in_ 的 OR）
- [x] 1.7 RED — 测 `count_players` 带新筛选返回真实总数（造 >?? 行，断言 count 与 list 去重后一致、不受 limit 影响）；测多维 AND（gender+year）
- [x] 1.8 GREEN — 确认 `count_players` 复用 `_filtered`；`routers/players.py` 列表加 `gender`/`team`/`year` Query 参数透传
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/player-registry/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS else FIX + retry

## 2. 前端 api 层：PlayerFilters 加 gender / team / year

### Contract
- **Spec**: player-registry（同上筛选维度，前端取数出口须能传）；player-admin-ui —— 「左栏 SHALL 支持按…性别…所在队伍（模糊…）…参赛年份…筛选」的取数支撑。
- **Runtime**: `cd frontend && npm run test -- lib/api` → expected: `getPlayers`/`getPlayersPage` 把 gender/team/year 拼进 query string 的单测过；`npx tsc --noEmit` 干净（vitest 不做类型检查，须单列 tsc）。
- **Code**: `PlayerFilters` 加 `gender?: string`、`team?: string`、`year?: number|string`；`PlayerPageFilters` 继承；`getPlayers`/`getPlayersPage` 各自 `params.set`（有值才设）。契约字段用 literal / 明确类型，避免后端漂移静默。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/player-admin-workbench/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `lib/api.test.ts` 加测：`getPlayers({gender,team,year})` 请求 URL 含 `gender=`/`team=`/`year=`；无值不设。断言失败
- [x] 2.2 GREEN — `PlayerFilters`/`PlayerPageFilters` 加字段；`getPlayers`/`getPlayersPage` 拼参数
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + diff; review + score; ≥80 PASS else FIX + retry

## 3. 前端：查看/编辑双模式 + 去掉 layout gate

### Contract
- **Spec**: player-admin-ui —— 「队员管理页有查看/编辑双模式，查看任人可读」（任何人只读进入、不重定向；`canEdit` 判编辑；解锁出开关；查看模式隐所有写控件）；MODIFIED「未登录时管理界面不是死入口」（改为只读查看 + 就地解锁入口）。
- **Runtime**: `cd frontend && npm run test -- players` → expected: 页面/布局/头控件的模式与 gate 单测过；`npx tsc --noEmit` 干净。
- **Code**: 新 `PlayerEditContext`（`{canEdit, editing, setEditing}`，**默认 editing=false**——合并/拆分不可逆，默认只读更稳）+ `PlayerEditHeaderControl`（镜像 `TeamEditHeaderControl`：未 canEdit→`EditModeToggle` 带 season/division；canEdit→编辑/查看开关+登出）；`players/layout.tsx` **去掉 canEdit 重定向**改 pass-through；写控件按 `editing` 显隐。跨 server→client 边界只传序列化 server action + `canEdit` 数据，不传 render-prop 函数（既有 pitfall）。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/player-admin-workbench/contracts/group-3.md with the ### Contract block above
- [x] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-09-05-player-admin-workbench-mocks.html（桌面查看模式 / 编辑模式两块）；记 token 与页头文案（「编辑模式/查看模式」「✓ 已解锁」「未裁决」）
- [x] 3.2 RED — 测 `players/layout.tsx` 不再对非 canEdit 重定向（渲染 children）；测未 canEdit 时页面出「编辑模式」解锁入口、无写控件
- [x] 3.3 GREEN — 去 layout 重定向；加 `PlayerEditContext` + `PlayerEditHeaderControl`
- [x] 3.4 RED — 测查看模式隐写控件、编辑模式显；默认 editing=false（canEdit 时仍先查看）
- [x] 3.5 GREEN — 写控件按 `editing` 显隐；默认查看
- [x] 3.6 VISUAL DIFF — bring up dev stack (project.dev_stack_command)；登录该比赛；比对页头开关/解锁态与 mock 桌面两块；修 token/文案漂移
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + specs/player-admin-ui/spec.md + design.md + diff; review + score (threshold 70); ≥70 PASS else FIX + retry

## 4. 前端：左右两栏工作台（搜索 + 结果列表 + 就地详情）

### Contract
- **Spec**: player-admin-ui —— 「左右两栏工作台，左搜索右详情」（左栏不动、右栏随选、窄屏两屏、空态）；「左栏支持多字段搜索」（姓名/性别/队伍模糊/年份，AND，显式提交，条件入 URL，新搜索清选中）；「选中经软导航就地更新右栏」（`?sel=`、key remount）；MODIFIED「队员列表呈现…」（结果行 姓名·性别·最新参赛UTR·所在队伍「最新一支+N」；自带滚动；空态）。
- **Runtime**: `cd frontend && npm run test -- players` → expected: 搜索/列表/详情面板组件单测过；`npx tsc --noEmit` 干净。
- **Code**: `page.tsx` 读 searchParams（q/gender/team/year + sel）→ 左 `list_players`、右 `getPlayer(sel)`；行是 `<Link href="?…&sel=id">`（软导航保留条件）、搜索 `<form method=get>` 不含 sel（新搜索清选中）；抽 `PlayerDetail`（server 组件）右栏与 `[id]` 路由共用，`merge`/`split` 仍走 `[id]` 子路由；右栏按 `sel` 加 `key` remount 防陈旧；结果行「最新参赛UTR」取 `season_utrs[0]`（筛年则该年值），队伍「最新一支+N」；列表自带 `overflow-y-auto`。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/player-admin-workbench/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 MOCK — open mock（桌面双栏 + 移动两屏）；记左栏字段顺序、结果行四项、右栏详情要素、空态文案
- [ ] 4.2 RED — 测左栏搜索表单含 姓名/性别/队伍/年份 四控件、提交为 GET 且不带 sel；结果行显示 姓名·性别·最新参赛UTR·所在队伍
- [ ] 4.3 GREEN — 实现左栏搜索表单 + 精简结果列表（`<Link ?sel>`）
- [ ] 4.4 RED — 测右栏：无 sel 出空态；有 sel 出该人 `PlayerDetail`；切换 sel 右栏按 key remount（不残留上一人）
- [ ] 4.5 GREEN — 抽 `PlayerDetail`，`page.tsx` 右栏按 sel 渲染 + key；`[id]` 路由改用 `PlayerDetail`
- [ ] 4.6 VISUAL DIFF — dev stack；比对桌面双栏 + 移动两屏（<768 堆叠、返回）与 mock；修漂移；核对最长数据下列表滚动（自带滚动容器、不静默裁切）
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + specs/player-admin-ui/spec.md + design.md + diff; review + score (threshold 70); ≥70 PASS else FIX + retry

## 5. 验证

### Contract
- **Spec**: 全量——player-admin-ui + player-registry 两份 delta 的所有 SHALL。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest` 全绿 + `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + 新源码无 console.log。
- **Code**: 交付后本地实测（真实 2025 数据）：按性别、按中文队名模糊、按某年分别搜出预期集合；未解锁只读无写控件、解锁后可改/裁决/合并/拆分；`?sel` 切人右栏不残留。注意 pitfall：跑 pytest 会清库→跑完须补种再做视觉核对，顺序固定「先测→再补种→再视觉」。
- **Threshold**: 80

- [ ] 5.1 Run superpowers:verification-before-completion — 后端 pytest + 前端 vitest + tsc + console.log 审计全过；本地真实数据 e2e（搜索三维 + 双模式 + ?sel 切换）实测；修任何失败再收工
