### Contract
- **Spec**: notes-surfacing —— 「roster 编辑模式下评价可就地编辑：弹层顶部追加表单（类别+文本+追加）、
  时间线每条就地确认删除；空文本 MUST NOT 可提交；写失败就地报错」；「无评价的队员有『＋记评价』入口，
  点击打开同一个可编辑弹层；查看模式 MUST NOT 显示」；「编辑能力是共享组件上的**可选**能力，不传则只读，
  只读弹层不含写控件」。
- **Runtime**: `cd frontend && npm run test -- NotesPopover PlayerNotesBadges` + `npx tsc --noEmit` → expected: 可编辑弹层（有表单+删除、空文本禁用、点删除就地确认）与只读弹层（无写控件）单测过；`PlayerNotesBadges` 空 notes+editable 渲染「＋记评价」、非 editable 渲染 null 的单测过；tsc 干净。
- **Code**: `NotesPopover` 加**可选** `edit` 能力（传绑定好的 add/delete server action + pending/错误态），传了才渲染追加表单（复用 `NotesSection` 的类别常量、trim/空校验、就地确认删除）+ 逐条删除；不传 = 现有只读弹层不变。`PlayerNotesBadges` editable 且空 notes → 渲染「＋记评价」触发器（弹层空态「还没有评价，追加第一条。」）；非 editable 空 → null。面板是 body portal，表单内点击不被「点外部关闭」误关。只读组件签名向后兼容（新增全是可选 prop）。
- **Threshold**: 70

