### Contract
- **Spec**: (lineup-saved-lineups) 每个已存阵容 SHALL 带一个整数 `sort_order`。列表 SHALL 按
  `(sort_order 升序, id 升序)` 返回，取代按 `name` 排序。新存的阵容 SHALL 取该队现有
  `sort_order` 的最大值 +1。`sort_order` 随 `SavedLineupOut` 带出。迁移现有行时 SHALL 按原
  `name` 顺序回填。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q` → expected:
  列表按 (sort_order,id)、新存 max+1、响应含 sort_order，全绿。
- **Code**: D1 —— `sort_order int not null default 0`，migration 内 `row_number() over(partition
  by team_id order by name)` 回填；`set search_path to zijing_cup` 开头；本地打 127.0.0.1、远程
  Dashboard 手工执行、禁 CLI push。D2 —— `list_saved_lineups` 改 `order_by(sort_order, id)`；
  `save_lineup` 新行分支 `max(sort_order)+1`，upsert 到已有行不动 sort_order。
- **Threshold**: 80
