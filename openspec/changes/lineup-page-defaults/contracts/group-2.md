# Contract — Group 2

- **Spec**: 每一套候选 SHALL 用每条线三行块呈现（行1 线名+和+buffer 占用、行2/3 两名队员各一行含 姓名+性别符号 ♂/♀+参赛 UTR），五条线块横排一行、窄屏折。所有数字取自后端、前端 MUST NOT 做数值比较；桌面与 <768 MUST NOT 横向溢出（撑不下自带横滚）。右栏上半的已存阵容 SHALL 与候选用同一种三行块；已存阵容合法性 SHALL 仍只取后端四态、MUST NOT 由前端从快照重判。
- **Runtime**: `cd frontend && npm run test` → expected: LineBlock 单测（三行、♂/♀、UTR、超 cap 标注）、候选与已存阵容都用 LineBlock 渲染、contrast 测试含 ♂/♀ 对 全通过
- **Code**: D3 抽共用 `LineBlock`（线名+和+buffer 占用；两名队员各一行 姓名+`GenderMark`(♂/♀)+UTR）；`CandidateTable`/`CandidateRow` 与 `SavedLineups` 改用它、五块 `grid-cols-5` 窄屏折。`GenderMark` 颜色新增 token 对，♂/♀ 在各自底色 ≥4.5:1，进 `globals.contrast.test.ts`。前端只显示后端字符串。
- **Threshold**: 70
