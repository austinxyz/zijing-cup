### Contract
- **Spec**:
  - 后端 SHALL 提供球队列表与球队名单两个只读端点。球队列表 SHALL 为每支球队
    带出名单人数与按性别的人数分布；性别为空的记录 MUST 单独计数，MUST NOT
    并入任一性别。两个端点 SHALL 带出球队的显示名（未配置时为空）。系统
    MUST NOT 提供任何修改名单或球队的 HTTP 端点。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_api.py` → expected: 全部通过，含性别三档自洽、显示名带出、无写方法的断言
- **Code**:
  - 性别计数在**后端一次聚合查询**里算，不要退化成先查球队再逐队查性别
    （18 支队 = 18 次额外往返）。
  - 第三档「性别未填」不是冗余：`gender` 可空，并进任一侧会让那一侧人数
    凭空多一个人，而人数正是这一列存在的理由。2025 数据里该档恒为 0。
  - 「无写方法」的断言必须读 `app.openapi()["paths"]`，不能遍历 `app.routes`
    —— 当前 FastAPI 版本把 `include_router` 存成单个不透明条目，遍历它看不见
    任何 `/api` 路由而静默通过。
- **Threshold**: 80
