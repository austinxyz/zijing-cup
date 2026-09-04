## Context

排阵页 `app/[season]/[division]/lineup/[code]/page.tsx` 是 server component，现状**只要
URL 带锁定/排除参数就整解一次候选**（并在有约束时并发跑一次无约束基线算「锁定代价」）。
候选走 `LineupResults`（桌面 `CandidateTable` + 手机 `CandidateRow`）；已存阵容在独立
`/saved` 页由 `SavedLineups` 呈现，后端已带 `line_totals`/`buffer_spent`。控件是
`LineupControls`（每线两下拉 + 锁整对 + 排除勾选），载入阵型通过写 URL 参数触发重渲染
（因而当前会立刻搜）。admin 通过 `/login` 页设会话 cookie，`isSignedIn()` 决定 `canEdit`。

## Goals / Non-Goals

**Goals:**
- 默认不整解：无 `go` 时右栏下半无候选；右栏上半折叠已存阵容。
- `go` 门控搜索，保持 URL 可分享。
- 载入阵型只预填现有控件、不即搜、可保存。
- 候选与已存阵容统一「每条线三行块」（姓名+♂/♀+UTR）。
- 就地输 admin 密码解锁编辑，免跳 `/login`。

**Non-Goals:**
- 不改后端引擎/端点/鉴权模型；无 migration。
- 不新增编辑能力本身（复用 `lineup-saved-lineups` 的保存/编辑器）。
- 不重画 `LineupControls`。

## Decisions

**D1 `go` 门控（server 侧）。** `page.tsx` 读 `searchParams.go`：无 `go` → **不调用**
`getTeamLineups(constraints)`（候选区为空），仍读 `getSavedLineups` + `getDivisionRules`
渲染右栏上半与控件；有 `go` → 走现状（并发候选 + 无约束基线）。门控在 server 判定（客户端
拦不住直接访问带参 URL）。`go` 不进 `constraintsFromQuery`，只做开关。

**D2 右栏两段式，保留两栏。** 布局仍 `LineupControls`（左）+ `main`（右）。右栏 `main`
内：上段 `<CollapsibleSaved>`（默认展开、可折叠，内嵌 `SavedLineups`），下段候选区
（`go` 时 `LineupResults`，否则空态「点搜索阵容计算」）。折叠态用受控 `useState` 客户端
组件包一层；壳仍 `overflow-hidden`，两段各自可滚。

**D3 三行块抽成共用组件 `LineBlock`。** 新 `LineBlock`（线名 + 和 + buffer 占用；两名
队员各一行：姓名 + `GenderMark`(♂/♀) + UTR）。候选与已存阵容都渲染它：`CandidateTable`/
`CandidateRow` 与 `SavedLineups` 改为用 `LineBlock`，五块横排（`grid-cols-5`，窄屏折）。
候选每套的 `line_totals` 后端已带；已存阵容同样已带。`GenderMark` 新增 token 对（♂/♀ 颜色
需 ≥4.5:1，进 `globals.contrast.test.ts`）。前端不做数值比较，只显示后端字符串。

**D4 载入 = 预填 + 草稿 + 保存。** 载入把阵型锁定/排除写进控件对应的 URL 参数**但不加
`go`**（复用现有 `buildLoadHref`，去掉任何触发搜索的部分——现状是写参即搜，加 `go` 门控后
写参不再自动搜，天然满足）。「搜索阵容」按钮 = 提交当前控件 + `go=1`。保存复用
`savePreset`（覆盖）与新增「另存」（同 action，不同名）；保存入口在控件区，不要求候选存在。

**D5 就地解锁编辑。** 新客户端组件 `EditModeToggle`：开关 → 显示口令输入 → 调用**现有**
`login` server action（`useActionState`），成功后 `router.refresh()` 让 server 重读会话、
`canEdit` 变真、编辑控件出现。失败沿用 `login` 返回的 `bad-password`/`rate-limited` 文案。
会话仍是 httpOnly cookie；写路由仍靠方法判权中间件。已登录时开关显示「已解锁 · 登出」。

## Risks / Trade-offs

- [默认不搜可能让老用户以为坏了] → 候选区给明确空态（「点搜索阵容计算」）+ 醒目按钮；
  已存阵容打底让页面非空。
- [`go` 改了 URL 契约，旧分享链接（无 go 但带参）不再直接出结果] → 可接受：那类链接
  改为落在草稿态（控件已填、点搜即得）；stale-key 逻辑不变。文档说明。
- [三行块比表格占纵向空间] → 五块横排一行抵消；候选多时下段自带滚动。
- [就地解锁与 `/login` 两条入口] → 复用同一 action 与限速，不新增信任面；`x-forwarded-for`
  取值等限速细节沿用 `login` 现有实现，不动。

## Migration Plan

纯前端，无 migration、无端点变更。部署即生效；回滚 = 还原前端提交。

## Open Questions

（无——探索期的开放问题已在需求评审与本设计定案：右栏内嵌已存阵容 + `/saved` 保留为
深链接；无已存阵容时空态 + 不自动搜；三行块五块横排；就地解锁复用登录 action。）
