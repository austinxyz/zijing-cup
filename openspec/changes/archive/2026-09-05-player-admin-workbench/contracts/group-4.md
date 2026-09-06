### Contract
- **Spec**: player-admin-ui —— 「左右两栏工作台，左搜索右详情」（左栏不动、右栏随选、窄屏两屏、空态）；「左栏支持多字段搜索」（姓名/性别/队伍模糊/年份，AND，显式提交，条件入 URL，新搜索清选中）；「选中经软导航就地更新右栏」（`?sel=`、key remount）；MODIFIED「队员列表呈现…」（结果行 姓名·性别·最新参赛UTR·所在队伍「最新一支+N」；自带滚动；空态）。
- **Runtime**: `cd frontend && npm run test -- players` → expected: 搜索/列表/详情面板组件单测过；`npx tsc --noEmit` 干净。
- **Code**: `page.tsx` 读 searchParams（q/gender/team/year + sel）→ 左 `list_players`、右 `getPlayer(sel)`；行是 `<Link href="?…&sel=id">`（软导航保留条件）、搜索 `<form method=get>` 不含 sel（新搜索清选中）；抽 `PlayerDetail`（server 组件）右栏与 `[id]` 路由共用，`merge`/`split` 仍走 `[id]` 子路由；右栏按 `sel` 加 `key` remount 防陈旧；结果行「最新参赛UTR」取 `season_utrs[0]`（筛年则该年值），队伍「最新一支+N」；列表自带 `overflow-y-auto`。
- **Threshold**: 70

