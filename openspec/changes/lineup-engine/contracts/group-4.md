### Contract
- **Spec**:
  - 后端 SHALL 提供一个只读端点返回搜索结果，锁定与排除通过 query 参数传入。
    系统 MUST NOT 因此新增任何写方法。
  - 未知球队 SHALL 返回 404。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_api.py` → expected: 全部通过，含 query 锁定被遵守、未知球队 404、OpenAPI 中仍无写方法
- **Code**:
  - 「无写方法」的断言必须读 `app.openapi()["paths"]`，不能遍历 `app.routes`——当前
    FastAPI 版本把 `include_router` 存成单个不透明条目，遍历它看不见任何 `/api` 路由
    而静默通过。
  - 路由只负责读库、调纯函数、组装响应；约束与搜索逻辑不得下沉到路由里。
- **Threshold**: 80
