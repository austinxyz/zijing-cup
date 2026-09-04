# Contract — Group 3

- **Spec**: 载入一套已存阵型 SHALL 把其锁定/排除预填进现有 `LineupControls`、不新画界面；载入 SHALL NOT 立即搜索（URL 为草稿、无 `go`），点「搜索阵容」才算；载入后这套 SHALL 可继续编辑并保存（覆盖原阵型或另存），保存 MUST NOT 要求先搜出候选。
- **Runtime**: `cd frontend && npm run test` → expected: 载入编码不含 `go`（草稿）、保存/另存 action 调用、既有 preset 测试无回归 全通过
- **Code**: D4 载入复用 `buildLoadHref` 写控件参数**不加 `go`**（`go` 门控后写参不再自动搜）；「搜索阵容」= 提交控件 + `go=1`；保存复用 `savePreset`（覆盖）+ 新增「另存」（同 action、不同名），入口在控件区、不要求候选存在。
- **Threshold**: 70
