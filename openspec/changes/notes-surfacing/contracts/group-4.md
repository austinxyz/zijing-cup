### Contract
- **Spec**: notes-surfacing —— 「机密门：仅 canEdit 时批量取评价并渲染；未解锁 MUST NOT 发批量取评价
  请求、MUST NOT 渲染任何标记/内容」；「解锁后对手对比两侧都显示」；「取数失败降级、不拖垮宿主页」；
  「纯展示不改候选集合/排序」。
- **Runtime**: `cd frontend && npm run test -- lineup compare teams` + `npx tsc --noEmit` → expected: 三页机密门单测过（canEdit 时 `getPlayerNotesBatch` 被调且传入、未 canEdit 不调不渲染、对手对比两侧都传、批量失败降级空）；tsc 干净。
- **Code**: 三个 Server Component 页仅 `canEdit(season,division)` 时收集本屏 player_id 批量取、构造 `Record<id,PlayerNote[]>` 传下（排阵：候选+已存经 `LineBlock`；对手对比：两队两侧；roster：`RosterTable` 行）；未解锁传空/`null`、组件不渲染标记；批量取失败（api 已降级 `{}`）→ 无标记、主功能照常；不改候选生成/排序。
- **Threshold**: 80

