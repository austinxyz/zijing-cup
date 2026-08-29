# Contract — Group 3: 管理员鉴权

### Contract
- **Spec**:
  - 所有修改数据的路由 SHALL 要求管理员凭据（`X-Admin-Secret`）。这个检查 MUST 沿用现有
    共享密钥中间件的形状——减法式覆盖：新加的写路由不声明任何东西就已经受保护。
  - `ADMIN_SECRET` 未配置时，系统 SHALL 拒绝全部写请求。缺失的密钥 MUST 意味着「谁都进
    不来」，MUST NOT 意味着「谁都能进」。
  - 读路由 MUST NOT 因此改变：它们继续只要求现有的共享密钥。
- **Runtime**: `cd backend && uv run pytest tests/test_admin_auth.py tests/test_roster_api.py` → expected: 全部通过，含无凭据写请求被拒、密钥未配置时全拒、新增写路由自动受保护、读路由不受影响；且 `test_roster_api.py` 里那条守卫被改写而不是删除
- **Code**:
  - 按 **HTTP 方法**判定而不是路由前缀（D4）：前缀靠人记得，方法是请求自带的属性，漏不掉。
  - 两个条件分开写，不折成 `if expected and provided != expected`——后者在变量未设置时会
    放行一切，正是现有注释里写明要避免的失败模式。
  - **不用 FastAPI 依赖**：依赖是加法式的，忘了挂就没有保护。
- **Threshold**: 80
