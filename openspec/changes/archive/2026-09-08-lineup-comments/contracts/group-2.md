## Contract — Group 2: 前端 api + server actions + 卡片可展开评论区

- **Spec**:
  - 已存阵容卡片 SHALL 有一个可展开「评论 N ▾」区：折叠态显示计数，点开显示倒序时间线（文本 + 时间 + 删除）+ 追加框。追加/删除 SHALL 只在编辑模式（`canEdit && editing`）可见可用；查看模式只读。空文本 MUST NOT 可提交；写失败就地报错。评论经既有 `adminWrite`（按比赛 scope）写、成功 `revalidatePath` 刷新。
  - 评论 SHALL 只在能看到已存阵容时可见……一屏多卡 SHALL 用一次批量请求取回评论。`getLineupCommentsBatch` 失败 SHALL 降级为 `{}`。
  - 克隆一套已存阵容 MUST NOT 复制原阵容的评论——克隆得到新 saved_lineup id，其评论为空。
- **Runtime**: `cd frontend && npx vitest run lib/api.test.ts app/[season]/[division]/lineup` 且 `cd frontend && npx tsc --noEmit` → expected: 新增用例全绿、tsc 0 错。
- **Code**:
  - `lib/api.ts` 加 `LineupComment` 类型（`{id, body, created_at}`）+ `getLineupCommentsBatch(ids): Record<number, LineupComment[]>`——空→`{}`不请求、非 ok/异常→`{}`降级（对称 `getPlayerNotesBatch`）。
  - server actions `addLineupComment`/`deleteLineupComment` 经 `lib/admin.ts` 的 `adminWrite`（scope `{season,division}`），trim/空则 no-op，成功 `revalidatePath(.../lineup/{team}, "layout")`（评论区同时在 /lineup/[code] 与 /lineup/[code]/saved 渲染，layout scope 盖两处）。
  - `SavedLineups` 卡片底部**卡片内可展开区**（本地 `useState` 折叠/展开）——不是 body-portal 弹层（躲触屏 hover 坑，CLAUDE.md）；追加/删除 gate = `useLineupEdit` 的 `canEdit && editing`；删除就地确认；复用 `notesDisplay.formatWhen`。
  - 排阵页 `page.tsx`/saved 页在 `canEdit` 时按本屏 saved_lineup id 批量取评论传入；未解锁不取。克隆不复制评论是后端 clone 的内在行为——前端无需改。
- **Threshold**: 70
