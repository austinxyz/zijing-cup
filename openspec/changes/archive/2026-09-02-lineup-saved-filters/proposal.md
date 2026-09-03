---
Date: 2026-09-02
Change: lineup-saved-filters
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-02-lineup-saved-filters-requirements.md
---

## Why

排阵的锁定/排除现在只活在 URL 里——要留住一套约束只能自己收藏链接。给队长一个命名的、
列在排阵页上的、管理员维护的过滤预设（preset）：存下当前锁定/排除，之后一键载入。这是三条
阵容增强里的 B（诊断 A 已落地；保存阵容 + 失效标记 C 另列）。

## What Changes

- 新增 **preset 存储**：`zijing_cup` 新表，按 (赛季, 组别, 队) 存命名的锁定+排除集合（JSONB）。
- 新增 **写命令**：管理员存（create 或同名覆盖）与删 preset；靠既有 HTTP-方法 admin 中间件
  自动受保护，**不**声明新前缀、**不**用依赖式鉴权。
- 新增 **只读端点**：列出某队的所有 preset（任何人可读，经 `lib/api.ts`）。
- 前端 **排阵控件**加「已存阵型」块：列出 + 一键载入（把 locks/excluded 写回 URL 参数，
  搜索路径不变）；管理员另见「存为阵型」输入行与删除。
- **载入失效处理**：preset 的**锁定**引用了已不在名单的球员 → 明说 + 拒载 + 删/重建入口；
  **排除**引用离队球员 → 照常载入（那条排除已无意义），中性提示。检查用页面已有 `search.roster`。

## Capabilities

### New Capabilities

- `lineup-filter-presets` —— preset 的存取契约：表结构、CRUD 写命令（admin）、列出端点（只读）、
  同队名唯一/同名覆盖、输入约束 JSONB 形状。

### Modified Capabilities

- `lineup-ui` —— 排阵页新增保存/列表/载入/失效呈现（读写经既有出口，载入写回 URL）。

## Impact

- 后端：新 migration `supabase/migrations/*.sql`（`zijing_cup.lineup_filter_presets` 表）；
  新模块 `backend/app/lineups/presets.py`（模型 + 命令 + 查询）或并入 `app/lineups/`；
  路由 `backend/app/routers/lineups.py`（GET 列出 + POST 存 + DELETE 删）；
  `backend/tests/` 存/取/删/覆盖/失效/无凭据被拒。
- 前端：`frontend/lib/api.ts`（列出类型 + fetch）、`frontend/lib/admin.ts`（存/删 server action）；
  `frontend/app/[season]/[division]/lineup/[code]/`（控件里的 preset 块、载入逻辑、失效面板）+ 测试。
- 无改搜索算法/URL 编码/A 诊断。`npx tsc --noEmit` 单列。

## Out of Scope

- 保存阵容 / UTR 快照 / 合法性重判（deferred to lineup-saved-lineups，即 C）。
- per-user 登录 / preset 归属 / 多租户（admin-global）。
- preset 重命名/编辑（改名 = 覆盖）、跨队/跨组别共享 preset。
- 改搜索算法、cap/buffer/资格规则、候选呈现、A 的无解诊断。
