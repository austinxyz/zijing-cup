# Contract — group 4: 名单只读端点

- **Spec**: 后端 SHALL 提供球队列表与球队名单两个只读端点。系统 MUST NOT 提供任何修改名单的 HTTP 端点 —— 本项目没有 per-user 登录，公开可写的名单入口意味着任何人都能覆盖全部球队名单。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_api.py` → expected: 两个端点的 200 与三类 404 路径、无写方法断言全部通过
- **Code**:
  - 一次取出球队与其名单条目组装，不做 N+1（沿用 competition-rules 的做法）
  - 只读：不新增任何写端点；审计路由用 `app.openapi()["paths"]`，**不要遍历 `app.routes`** —— 当前 FastAPI 版本把 included router 存成单个不透明条目，遍历会看不见任何 `/api` 路由而空转通过（CLAUDE.md Pitfalls）
  - 路由仍在既有的 `X-Backend-Secret` 中间件之后
- **Threshold**: 80
