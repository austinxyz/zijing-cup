### Contract
- **Spec**: (lineup-saved-lineups) 重排 SHALL 接收该队已存阵容的整份有序 id 列表，按位置写
  `sort_order`。SHALL 幂等。列表与该队当前 id 集合不一致（含别队 id、缺项、重复）SHALL 整体
  拒绝（422）且不写任何一行。仅由方法判权中间件保护的写端点可达。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q -k "reorder or order"` → expected:
  按位置写、幂等、坏列表 422 整体拒，全绿。
- **Code**: D3 —— 端点体 `{"order": [id,...]}`；校验列表**恰好等于**该队当前 id 集合（无重复/
  无缺项/无别队 id）→ 否则 422 不写；相等则按下标写 `sort_order=0..n-1`。全量而非 per-move
  （幂等、抗竞态）。PATCH，方法判权自动保护。
- **Threshold**: 80
