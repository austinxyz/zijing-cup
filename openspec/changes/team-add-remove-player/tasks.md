# Tasks — team-add-remove-player

## 1. Server actions：加入 / 建新人加入 / 移出 / 搜索

### Contract
- **Spec**: team-roster-ui —— 「搜现有…选中一人 → 经 `adminWrite` `POST /players/{id}/memberships`（body 含本队 `team_id`）」；「建新人…先 `POST /players` 建全局队员 → 再 POST membership」；「`DELETE /players/{id}/memberships/{membership_id}`…`membership_id` 由前端用 `getPlayer(player_id)` 找到该队员在本队的 membership 解析」；「后端拒绝时 SHALL 就地显示后端 detail，MUST NOT 静默失败」。
- **Runtime**: `cd frontend && npm run test -- teams` → expected: 四个 server action 的单测（mock `adminWrite`/`getPlayer`）过；`npx tsc --noEmit` 干净。
- **Code**: `addExistingPlayerToTeam`/`createAndAddPlayer`/`removePlayerFromTeam`/`searchPlayersForAdd` 加进 `teams/[code]/actions.ts`，均经 `adminWrite`（scope `{season,division}`）；`createAndAddPlayer` gender `""→null`（词表只收 M/F/null）；`removePlayerFromTeam` 用 `getPlayer` 按 `team_id` 定位 membership_id 再 DELETE，找不到抛清晰错误；成功 `revalidatePath` 队伍页；错误 detail 冒泡不吞。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/team-add-remove-player/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — `teams/[code]/actions.test.ts` 加测：`addExistingPlayerToTeam` 调 `adminWrite("POST","/api/players/<id>/memberships",{team_id},{season,division})`。断言失败（函数未定义）
- [ ] 1.2 GREEN — 实现 `addExistingPlayerToTeam`
- [ ] 1.3 RED — 测 `createAndAddPlayer`：先 POST /players（gender ""→null）取回 id，再 POST membership；两次 adminWrite 顺序/参数
- [ ] 1.4 GREEN — 实现 `createAndAddPlayer`
- [ ] 1.5 RED — 测 `removePlayerFromTeam`：`getPlayer` 返回带本队 membership 的人 → DELETE 该 membership_id；找不到本队 membership → 抛错不 DELETE
- [ ] 1.6 GREEN — 实现 `removePlayerFromTeam`（getPlayer 解析 + DELETE）
- [ ] 1.7 RED — 测 `searchPlayersForAdd(query)` 调 `getPlayers({query})` 返回精简结果
- [ ] 1.8 GREEN — 实现 `searchPlayersForAdd`
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/team-roster-ui/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; ≥80 PASS else FIX + retry

## 2. TeamEditPanel：加入控件 + 行内移出确认

### Contract
- **Spec**: team-roster-ui —— 「队伍页编辑模式提供『加入队员』控件（搜现有 / 建新人）」及其 scenarios；「编辑模式下名单每行提供『移出』…就地确认」及其 scenarios；「控件 MUST NOT 在查看模式或未解锁本比赛时出现」；「后端拒绝就地显示 detail」。
- **Runtime**: `cd frontend && npm run test -- teams` → expected: TeamEditPanel 加入/移出交互单测过；`npx tsc --noEmit` 干净。
- **Code**: 加入控件（搜索输入 + 结果列「加入本队」+ 「新建」姓/名/性别 表单）与每行「移出」+ 就地确认，接 group 1 的 server actions；只在 `TeamEditPanel` 已渲染（canEdit + 编辑模式）时出现；后端 detail 就地显示；成功依赖 `revalidatePath`/RSC 重渲染刷新，不拼本地陈旧态；`team_id` 来源见 design D3（TeamRoster 带则用，否则 getDivisionTeams 按 code 解析）。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/team-add-remove-player/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — open docs/superpowers/specs/mocks/2026-09-05-team-add-remove-player-mocks.html；记 token 与文案（「加入队员」「加入本队」「新建队员」「移出」「确认移出」「取消」，确认条提示语）
- [ ] 2.2 RED — 测：编辑模式渲染出「加入队员」搜索控件 + 「新建」入口；点某行「移出」出就地确认（确认/取消）、未确认不触发删除
- [ ] 2.3 GREEN — 实现加入控件 + 行内移出确认，接 server actions
- [ ] 2.4 VISUAL DIFF — bring up dev stack；登录该比赛进编辑模式；比对加入控件（搜现有/新建）+ 行内移出确认与 mock；修 token/文案漂移
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + specs/team-roster-ui/spec.md + design.md + diff; review + score (threshold 70); ≥70 PASS else FIX + retry

## 3. 验证

### Contract
- **Spec**: team-roster-ui 全部新增 SHALL（加入搜现有/建新人、移出确认、模式门、后端 detail 就地）。
- **Runtime**: `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest` 全绿（后端未改，回归确认）+ 新源码无 console.log。
- **Code**: 交付后本地实测（补种真实 2025 数据）：往某队加一个别队的人、建一个新人加入、移出一人，三者各自生效并正确刷新；查看模式无加/移出；重复加入/锁季显示后端理由。注意 pitfall：先测→再补种→再视觉核对；本机后端起裸 uvicorn 不带 --reload、改完杀进程重起（防僵尸持旧代码）。
- **Threshold**: 80

- [ ] 3.1 Run superpowers:verification-before-completion — 前端 vitest + tsc + 后端 pytest 回归 + console.log 审计全过；本地真实数据 e2e（加现有 / 建新人 / 移出 / 模式门 / 重复与锁季提示）实测；修任何失败再收工
