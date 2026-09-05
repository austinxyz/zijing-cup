### Contract
- **Spec**: (lineup-ui) 已存阵容列表 SHALL 让管理员改顺序：桌面 HTML5 拖拽，手机每行 ↑/↓
  （44px，触屏 MUST 有非拖拽手段）。改序后 SHALL 发整份有序 id 列表；落库后刷新顺序 MUST NOT
  回弹。每行 SHALL 有「克隆」按钮。控件仅管理员显示。`SavedLineup` 类型 SHALL 带 `sort_order`。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/SavedLineups.test.tsx` (+ `npx tsc --noEmit`) → expected:
  ↑/↓ 交换并调重排（发全量有序 id）、克隆调用、非管理员无控件；tsc 干净。
- **Code**: D5 —— `SavedLineups` 维护本地有序 state（初值后端序，props 变时同步），拖拽/↑↓ 改
  state 后调 `reorderAction(全量 id)`（失败回滚 state + role=alert）；克隆调 `cloneAction(id)`；
  行 key 用 saved.id。写靠 server action 的 revalidatePath 刷新（同 delete，不用 router.refresh）。
  `SavedLineup` 加 `sort_order`（后端漂移红 tsc）。控件 `canEdit` 门控。
- **Threshold**: 70
