---
Date: 2026-09-03
Change: lineup-saved-lineups
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-03-lineup-saved-lineups-requirements.md
---

## Why

排阵能搜候选、存过滤（B）、钉人（pin），但**选定的那一套阵容留不住**。队长挑好一套想收着，
过些天参赛 UTR 动了（赛季未锁时改当前 UTR 会覆盖参赛 UTR），这套可能已非法，却无从知道。本次
保存一套具体阵容 + 当时 UTR 快照，在专门的已存阵容页重判合法性、点名谁的 UTR 动了，并允许**就地
编辑**（线间互换、从名单替人）修好失效的。三条阵容增强的 C（A、B 已落地），C1+C2 合并做完。

## What Changes

- **保存一套阵容**：候选结果行「保存此阵容」（admin/命名/按队；名唯一、同名覆盖）→ 存 10 人线位
  分配 + 当前每人参赛 UTR 快照。
- **服务端重判**：已存阵容页列出该队所有已存阵容，每套用**当前** UTR 跑既有 `check_lineup`，给四态：
  仍合法 / UTR 动了仍合法 / 已非法（点名卡哪条约束）/ 有人离队；逐人点名快照 vs 当前 UTR 差异。
- **就地编辑器**：线间互换、从名单替换个别人，**每次改实时**跑 `check_lineup`（当前 UTR）报卡哪条；
  存回=覆盖 + 重拍快照。编辑自由改、合法性是唯一护栏（重复上场等 violation 当场报，不预拦）。
- **载入 / 删除**：一键锁满五线写进排阵 URL（含离队/旧 key 走 stale-link）；admin 删。
- **校验端点**：新增只读校验（POST body=5 线 assignment → violations，用当前 UTR 解析后跑
  `check_lineup`）。因 POST 被方法判权自动要求 admin——与「编辑是 admin 动作」一致。

## Capabilities

### New Capabilities

- `lineup-saved-lineups` —— 已存阵容的存取契约：表（线位分配 + UTR 快照）、CRUD（admin）、服务端
  重判四态、校验 assignment 端点、快照只读不回写。

### Modified Capabilities

- `lineup-ui` —— 候选行的保存入口、已存阵容页、就地编辑器、失效/UTR-diff 呈现、载入。

## Impact

- 后端：新 migration（`zijing_cup.saved_lineups` 表）；新模块 `backend/app/lineups/saved.py`（模型 +
  存/列/删/存回命令 + 重判 + 校验）；`backend/app/routers/lineups.py`（GET 列出+重判 / POST 存 /
  PUT 存回 / DELETE 删 / POST 校验）；复用 `rules.py` 的 `check_lineup`；`backend/tests/` 覆盖四态 +
  校验 + 快照不回写 + 鉴权。
- 前端：`frontend/lib/api.ts`（类型 + 列出/校验 fetch）、`frontend/lib/admin.ts`（存/删/存回 action）；
  候选行保存入口（`lineup/[code]/` 结果区）；新路由 `lineup/[code]/saved/`（已存阵容页 + 编辑器）+ 测试。
- 无改搜索引擎/目标函数/规则/pin/preset。`npx tsc --noEmit` 单列。

## Out of Scope

- 不改搜索引擎、cap/buffer/资格规则、候选呈现、pin、B/preset 代码。
- 不做自动修复（用户手动改，系统只说合法/卡哪条）。
- 不冻结/不回写任何人参赛 UTR（快照只读对比）。
- per-user / 归属 / 多租户 / 跨队共享 / 历史版本（存回即覆盖）。
