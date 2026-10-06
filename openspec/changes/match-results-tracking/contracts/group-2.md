## 2. 前端：录入表单 + 比赛历史页 + 侧栏入口

### Contract
- **Spec**:
  - 系统 SHALL 提供一个比赛历史页，列出该 (season, division) 所有录过的比赛（我方队 / 对手 / 日期 / 轮次 / 整场结果），SHALL 支持按队筛选，并 SHALL 能点开一场看逐线详情（双方逐线球员 + 每线 win/loss + 备注）。该页 SHALL 从侧栏有入口。
  - 录入时系统 SHALL 支持「复制自某套已存阵容」预填再调整。
  - 录入入口、历史页 SHALL 按 `canEdit(season, division)` 门：免密队员 SHALL 看不到录入入口、历史页不可达。当比赛记录表在远程尚未建好时，所有读路径 SHALL 降级为「无历史」而非 500。
- **Runtime**: `cd frontend && npm run test` → expected: match-results 组件/页测试全绿（注意：vitest 不做类型检查，另须 `npx tsc --noEmit` 过——见 config custom_verification_checks）
- **Code**:
  - 读经 `lib/api.ts` 单一出口，`getMatchRecords` 等取数失败降级 `[]`（照 getSavedComparisons 范式，兜未建表远程）（design D6）；写经 `lib/admin.ts` `adminWrite` scope `{season,division}` + 成功 `revalidatePath(..., "layout")`。
  - 我方/对手球员只存引用，显示在读时经 roster `key→player`/`id→player` 解析；对不上显示「未记录」而非空白/0（design D3，spec「对不上留空」）。
  - 新路由 `app/[season]/[division]/matches/` 每条自带 `error.tsx`（冷启动取数失败不清侧栏）；录入表单的 server action try/catch、只成功时 reset。
  - 侧栏入口照 participation-utr-sampling 先例加（canEdit 可见）。
- **Threshold**: 70

