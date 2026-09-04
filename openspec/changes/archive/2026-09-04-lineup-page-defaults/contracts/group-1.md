# Contract — Group 1

- **Spec**: 排阵页 SHALL 保留左右两栏；右栏**上半** SHALL 呈现该队已存阵容且 SHALL 可折叠收起，右栏**下半**为候选区；首次打开（无搜索请求）时下半 SHALL 不含候选，且页面 SHALL NOT 触发候选搜索。候选 SHALL 仅在请求带 `go` 时计算；不带 `go` 的 URL 为草稿（回显控件与已存阵容、SHALL NOT 整解）；带 `go` 的 URL 直接访问 SHALL 得到同一套候选；门控 SHALL 在服务端判定。
- **Runtime**: `cd frontend && npm run test` → expected: page 门控测试（无 go 不取候选 / 有 go 取候选）、既有 lineup page 测试无回归 全通过
- **Code**: D1 `page.tsx` 读 `searchParams.go`：无 go 不调 `getTeamLineups(constraints)`（候选空），仍读 `getSavedLineups`+rules 渲染右栏上半与控件；有 go 走现状（并发候选 + 无约束基线）。`go` 不进 `constraintsFromQuery`，只做开关。D2 右栏 `main` 两段：上段可折叠 `SavedLineups`、下段候选或空态；壳 overflow-hidden，两段各自可滚。
- **Threshold**: 70
