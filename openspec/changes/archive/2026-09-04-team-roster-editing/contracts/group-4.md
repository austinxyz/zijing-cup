# Contract — Group 4

- **Spec**: 队伍页 SHALL 提供「编辑模式」开关就地输口令解锁（复用登录 action、同款反馈、方法判权仍保护），只读用户 SHALL NOT 见编辑控件。当前双打 UTR SHALL 可就地批量输入、一个保存提交、改动格有标记、沿用锁季覆盖语义。SHALL 可改 is_borrowed_player/is_wildcard、（条件）representing_school、school_count；外援/外卡行学校控件禁用；名单外援超 roster_cap 保存**警告放行**；school_count 驱动上限提示。
- **Runtime**: `cd frontend && npm run test` → expected: 队伍页编辑组件测试 + 既有 roster 测试无回归 全通过；`npx tsc --noEmit` 干净
- **Code**: D4 `teams/[code]` 挂 `EditModeToggle`（复用，signedIn=canEdit）；`RosterTable`/`RosterEditor` 编辑态批量双打输入 + 外援/外卡勾选 + 代表学校下拉（borrowed/wildcard→disabled）+ school_count 头部输入 + 保存/警告；只读不渲染控件；roster 取数扩 school_count + per-player borrowed。
- **Threshold**: 70
