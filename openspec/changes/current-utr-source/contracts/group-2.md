### Contract
- **Spec**: 后端 SHALL 提供一个只读端点，按 `(赛季, 组别, 球队)` 返回该队每名队员的 id、姓名与五个当前值；顺序 SHALL 与名单页一致。后端 SHALL 提供一个写端点，接受若干 `(id, 要改的字段)` 并在一个事务里写入，任一条失败时 SHALL 整批回滚。该端点 SHALL 只接受这五个字段，MUST NOT 借此改动姓名、性别或任何赛季数据。赛季锁 SHALL NOT 阻止这里的写入。当前 UTR SHALL 存在 `players` 上，一名队员只有一份。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_api.py -q` → expected: 全部通过
- **Code**:
  - D8：一条失败整批回滚；端点只认这五个字段 —— 能顺带改姓名的「UTR 导入」会让 D2 的姓名校验位失去意义。
  - 写路由由 `app/auth.py` 中间件按 HTTP 方法保护，不需要也不应该改成前缀判定或 FastAPI 依赖。
  - 导出次序与名单页一致（参赛 UTR 降序，同值按姓）——两处不一致会让人以为导错了队。
- **Threshold**: 80
