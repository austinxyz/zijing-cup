# Contract — group 4: 规则查询端点

- **Spec**: 后端 SHALL 提供 `GET /api/seasons/{year}/divisions/{code}/rules`，返回该赛季该组别的完整规则（线定义、Buffer、资格限制、胜负判定方式、通用阵容约束）。系统 MUST NOT 提供任何修改规则的 HTTP 端点。
- **Runtime**: `cd backend && uv run pytest tests/test_rules_api.py` → expected: 200 与两类 404 路径测试全部通过
- **Code**:
  - 一次取出组别 + 线 + 资格限制并组装为一个响应体，不做 N+1（design.md D4）
  - 规则数据量小且几乎不变，本次**不加缓存** —— 过早缓存会掩盖链路问题
  - 只读：不新增任何写入端点；路由仍在既有的 `X-Backend-Secret` 中间件之后
- **Threshold**: 80
