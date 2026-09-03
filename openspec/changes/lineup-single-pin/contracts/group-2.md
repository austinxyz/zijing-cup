### Contract
- **Spec**: 控件一条线 SHALL 按已填座位数呈现三态：一个=pin（「已钉」标识 + 「搭档交给引擎」小字）、两个=硬锁整对、零=交给引擎，三者可辨，半填 MUST NOT 看起来被忽略。pin SHALL 编码进可分享 URL、直接访问重现同一约束。pin 使某线无解时面板 SHALL 点名被钉者与线、呈现含被钉者对的原因，取代光秃秃一句，MUST NOT 猜替补。面板对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: constraintsFromQuery 三态 / pins URL 编码 / 控件三态标识 / NoSolution pin 点名 新测试通过、既有 lineup 测试无回归
- **Code**: D1 `constraintsFromQuery` 分出 `{locks, pins, excluded}`：恰好一座位=pin、两座位=lock、两座同人=非法（不产约束）。`lib/api.ts` 的 `LineupConstraints` 加 `pins`，query 构造发 `pin=LINE:key`；`hasStaleKeys` 也扫 pins。D5 控件按每线座位数渲染三态（pin warning 描边 + 「已钉」角标 + 「搭档交给引擎」小字；硬锁 primary + 「锁整对」），用设计 token。pin 无解复用既有 `NoSolution`（后端 message 已含「你把 X 钉在 L」点名），前端无需新面板。前端不做数值比较。
- **Threshold**: 70
