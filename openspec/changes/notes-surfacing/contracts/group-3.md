### Contract
- **Spec**: notes-surfacing —— 「roster 与对手对比用分类小标（优点正色/弱点警示色/搭档蓝/其他灰，无评价
  不显示）」；「排阵 seat 用单标记『评』（含弱点警示色、否则中性色、无评价不显示；改动只在共享
  `LineBlock` 一处，候选与已存一致）」；「共用只读时间线弹层（倒序、类别标签+文本+时间、只读、桌面
  hover+click / 移动 click、自带滚动）」；「纯展示，不影响排阵逻辑」。
- **Runtime**: `cd frontend && npm run test -- Notes LineBlock` + `npx tsc --noEmit` → expected: `NotesPopover`/`PlayerNotesBadges`/`LineBlock` seat 标记 单测过（倒序渲染、无评价不显、弱点警示色、点开弹层只读无写控件）；tsc 干净。
- **Code**: `NotesPopover`（client，只读时间线，受控 open，`<button>` 触发，`max-h`+`overflow-auto`）；`PlayerNotesBadges`（按类别 pill+条数，空则 null）；`LineBlock` seat 加可选 `notes` → 「评」标记（`category==="weakness"` 警示色否则中性）；类别→中文/颜色 token 抽共享常量（与详情页 `NotesSection` 合一，避免漂移）；弱点统一警示色、优点正色、对比度 ≥4.5:1、容器显式底色。
- **Threshold**: 70

