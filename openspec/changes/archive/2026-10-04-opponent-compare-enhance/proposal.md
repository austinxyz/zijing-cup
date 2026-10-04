---
Date: 2026-09-28
Change: opponent-compare-enhance
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-28-opponent-compare-enhance-requirements.md
---

## Why

现有 `/compare` 逐线并排好用，但排阵前的三件常做动作缺位：选阵容时看不到这套谁上场、
搭好的对比无法留存、想给某条线记一句判断没有地方。补齐这三件让对手对比从「一次性看」
变成「可复用、可标注」的排阵工具。

## What Changes

- **选阵容即见上场人员**：阵容下拉选项带上场签名；选完某侧（不必等另一侧）即在该侧下方
  渲染这套阵容的 5 线 10 人（姓名 + 性别 + 参赛 UTR）。纯前端，复用现有 saved lineup
  `assignment` + roster 解析。
- **保存对比（展开/折叠卡）**：新表 `zijing_cup.saved_comparisons` 按 `(season, division)`
  存一组引用（team_a/lineup_a_id/team_b/lineup_b_id）+ 名字 + `line_notes` JSONB。/compare
  顶部列出为可展开/折叠卡：**展开就地渲染这套对比（按引用实时重算）**，折叠收起；可删除。
  picker 只用于新建保存。
- **每线备注**：`line_notes` JSONB `{line_code: text}`，单条可改，挂已存对比；在展开卡的逐线
  表里就地编辑。即席（未保存）对比不提供备注。
- 新增受保护写路由（建/改/删对比、写 line_notes）与只读列出端点；机密门沿用
  `canEdit(season, division)`。
- 某侧引用的阵容被删：保留该对比卡，展开时该侧标「阵容已删」、不渲染该侧（不 cascade 删）。

## Capabilities

### New Capabilities

（无——扩展既有 opponent-compare 能力。）

### Modified Capabilities

- **opponent-compare** —— 在既有「逐线并排 + canEdit 门 + URL 状态」之上新增：阵容上场人员
  预览、保存/展开-折叠/删除对比（新表 + 读写端点）、每线单条可改备注。

## Impact

- **后端**：`backend/app/models/` 新增 `SavedComparison` 模型；`supabase/migrations/` 新增
  `saved_comparisons` 表（`zijing_cup` schema，schema-qualified DDL）；`backend/app/routers/`
  新增只读列出 + 受保护建/改/删/写备注端点（靠 `WRITE_METHODS` 中间件自动保护）；
  `backend/tests/` 新增测试。
- **前端**：`frontend/lib/api.ts` 加对比类型 + `getSavedComparisons`（降级 `[]`）；
  `frontend/lib/admin.ts` 相关 server actions（`adminWrite` scope `{season,division}` +
  `revalidatePath`）；`frontend/app/[season]/[division]/compare/` 新增折叠卡组件、
  picker 侧名单预览、每线备注编辑；沿用 `error.tsx` 降级。
- **DB**：新表 `zijing_cup.saved_comparisons`；远程共享 Supabase 走 Dashboard 手工建表
  （no-CLI-push），读新表的后端 push 前先建表，读路径缺表降级空。
- **无破坏性变更**：不改 saved_lineups / roster / 规则模型；现有 /compare 行为保持。

## Out of Scope

- 名单实力对比、胜负/比分预测、引擎实时解对手最优阵容（沿用 opponent-compare 原 Out of Scope）。
- 每线备注的追加式时间线/多条历史（本次只做单条可改）。
- 即席（未保存）对比的每线备注。
- 实时 UTR 同步（载入实时重算 = 按当前 saved_lineup 状态重算，不联网取 UTR）。
