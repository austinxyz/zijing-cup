### Contract
- **Spec**: notes-surfacing —— 「系统 SHALL 提供一个按 player id 列表批量返回评价的只读端点…按 player_id
  分组返回，每名球员的评价按 `created_at` 倒序」；「无评价或不存在的 id **不出现**在返回映射里」；
  「空 ids → 空映射，不报错」；「读端点走 backend secret，不需要 admin」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "notes_batch or note"` → expected: 批量端点单测过（多 id 分组倒序、无评价 id 不占键、空 ids 空映射、无 X-Backend-Secret 401），既有 player_notes 测不回归。
- **Code**: 复用 `PlayerNote` 与 `_note_out`；`where player_id in ids order by player_id, created_at desc, id desc` 后 Python 侧分组成 `dict[int, list]`，只放有评价的 id；ids 解析去重、忽略非法项、clamp 数量上限（≤200）；读操作靠方法判权中间件自动保护、不加 admin。
- **Threshold**: 80

