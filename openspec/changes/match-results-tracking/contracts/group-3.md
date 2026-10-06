## 3. 前端：对手对比页「历史对局」区

### Contract
- **Spec**:
  - 在对手对比页（`/compare`），当已解锁管理员选中一支对手队后，系统 SHALL 显示一个「历史对局」区，列出我方对该对手队已录过的比赛（各场日期、我方用的阵容名、轮次、整场胜负），并 SHALL 汇总对该队的总战绩。该区 SHALL 仅对 `canEdit` 可见；未选对手或无记录时 SHALL 为空态（无内容而非报错）。读取失败时该区 SHALL 降级为空态、不拖垮对手对比页。
- **Runtime**: `cd frontend && npm run test` → expected: compare 页「历史对局」区测试全绿 + `npx tsc --noEmit` 过
- **Code**:
  - 「历史对局」是挂在核心页上的旁支只读：取数失败一律降级为空态，别让它的 500 变成对手对比的 500（CLAUDE.md「只读增强取数失败必须降级」）。
  - 取数在 canEdit 之后、server 端；非管理员不取不渲染（spec「仅 canEdit 可见」）。
  - 复用 group-1 的 `getMatchRecords`（按对手 code 过滤 + 整场结果）。
- **Threshold**: 70

