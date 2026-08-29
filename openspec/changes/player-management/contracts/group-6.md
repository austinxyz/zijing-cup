# Contract — Group 6: 登录、会话与写入口

### Contract
- **Spec**:
  - 浏览器 SHALL 通过 Next 的登录页以口令换取会话，会话 SHALL 存在 httpOnly cookie 中。
    `BACKEND_SECRET` 与 `ADMIN_SECRET` MUST NOT 出现在客户端 bundle 里。口令 MUST NOT 以
    明文形式存储，SHALL 以哈希形式配置。
  - 会话 SHALL 有有效期，过期后写操作 SHALL 被拒绝并要求重新登录。连续登录失败 SHALL 被
    限速，且剩余尝试次数或解锁时间要呈现在界面上。
  - 未登录状态下触发写操作，客户端 SHALL 得到「需要登录」而不是一个通用错误。
- **Runtime**: `cd frontend && npm run test -- app/login lib/session` → expected: 全部通过，含口令正确下发 httpOnly cookie、错误口令不下发且回传剩余次数、会话过期后写被拒、未登录写操作得到需要登录
- **Code**:
  - 登录在 Next 侧，写操作走 Server Action：服务端校验 cookie 之后才带上两个密钥调
    FastAPI（D5）。浏览器只与 Next 通信这条纪律不变。
  - 限速用内存计数（按 IP + 固定窗口），**不引 Redis**；注释写明「Render 免费实例单进程」
    这个前提，多实例下这条会失效。
  - 不用 JWT：只有一个管理员、一个服务端消费者，JWT 的可验证性没有用武之地。
- **Threshold**: 80
