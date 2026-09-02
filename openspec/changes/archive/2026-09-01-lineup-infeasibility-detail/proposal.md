---
Date: 2026-09-01
Change: lineup-infeasibility-detail
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-01-lineup-infeasibility-detail-requirements.md
---

## Why

排阵撞到「某条线凑不出任何合法搭档」时，界面只说「`{线}`没有任何合法搭档」——不说为什么，也不说是不是队长自己把人排除/锁走造成的。队长只能对着一句空话逐个试。本次给那句话补上原因与（可归因时的）点名。

## What Changes

- 后端 `search()` 在 `infeasible_line` 时，除线 code 外多返回一个**结构化诊断**：为什么这条线的候选池为空，覆盖四类客观原因——性别组合人手不足 / 都超 cap+buffer / 都超搭档差距 / 资格线限制挡住。多因并存时全部列出。
- 诊断在**可直接读出**时**归因到用户动作**：这条线缺的合格人手正是被排除 / 锁进别线的人，就点名他们及去向（复用 `placements`）。资格 / cap / 差距是规则或队员自身属性，据实说原因、**不**点名成用户造成。
- 诊断是**只读**候选池分析，MUST NOT 触发第二次整解搜索，MUST NOT 声称「哪条锁导致全局无解」——守住既有 `NoSolution` 免责声明。
- 前端 `NoSolution` 面板用「原因 + 归因」取代光秃秃的「没有任何合法搭档」，桌面与 <768 都读得清。
- 锁本身非法（`invalid_locks`）路径不动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `lineup-search` —— `search()` 出结构化 infeasible 诊断（原因 + 可归因时的点名）。
- `lineup-ui` —— `NoSolution` 呈现原因与归因。

## Impact

- 后端：`backend/app/lineups/search.py`（`legal_pairs` 收集过滤原因、`search` 组装诊断、响应模型加诊断字段）；`backend/tests/lineups/` 每类原因一个最小无解场景。
- 前端：`frontend/lib/api.ts`（`LineupSearch` 类型加诊断字段）；`frontend/app/[season]/[division]/lineup/[code]/LineupStates.tsx`（`NoSolution` 重做）+ 测试。
- 无新表、无 migration。`npx tsc --noEmit` 单列校验类型。

## Out of Scope

- 深层（assignment 级）无解归因——两条线抢同一个人导致整套凑不出，不在本次（只处理「某条线自己候选池为空」）。
- 改锁本身非法的诊断（`invalid_locks` 已够细）。
- 因果猜测——不声称某条锁/某次排除**导致了**无解。
- 保存过滤（deferred to lineup-saved-filters）、保存阵容 + 失效标记（deferred to lineup-saved-lineups）、per-user 登录、任何存储。
