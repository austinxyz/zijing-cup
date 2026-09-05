### Contract
- **Spec**: (lineup-saved-lineups) 克隆 SHALL 新建一行，`assignment`/`utr_snapshot` 与源逐字节
  相等（不重新快照）。新名字 SHALL 为 `<原名> 副本`，重名则 `副本2`/`副本3`…。新行 `sort_order`
  末尾。SHALL 计入 50 条上限（达上限 → 409）。仅由方法判权中间件保护的写端点可达。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q -k "clone"` → expected:
  逐字节复制、`副本N` 去重、max+1、50 上限 409，全绿。
- **Code**: D4 —— `clone_saved_lineup(session, team_id, saved_id)`：读源（不属该队 → 404），
  新行 `assignment`/`utr_snapshot` 原样赋值（**不**调 `_snapshot_for`）；名字 `<原名> 副本` 起，
  `(team_id,name)` 冲突则 `副本2`… 探测第一个空位；`sort_order` max+1；复用 `MAX_SAVED_PER_TEAM`。
  POST `_SAVED/{id}/clone`，方法判权自动保护。
- **Threshold**: 80
