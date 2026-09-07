### Contract
- **Spec**: player-notes —— 「详情右栏 SHALL 有『评价』区：追加表单（类别下拉+文本+追加）+ 倒序时间线（类别中文标签+文本+时间+删除）；删除就地确认；空文本不可提交；无评价空态；类别 key→中文」；「评价按 canEdit gate：仅 canEdit 时取评价并渲染，未解锁不显示内容也不发取评价请求」。
- **Runtime**: `cd frontend && npm run test -- notes players` → expected: NotesSection + PlayerDetail 机密门单测过；`npx tsc --noEmit` 干净。
- **Code**: `PlayerDetail` 加 `notes: PlayerNote[] | null` prop（null=未解锁不渲染评价区）；工作台 `page.tsx` 与 `[id]/page.tsx` `const notes = canEdit ? await getPlayerNotes(...) : null` 并发取；`NotesSection`（client）时间线 + 追加表单 + 每条删除（就地确认），写控件包 `EditOnly`（canEdit&&editing），空 body 按钮 disabled，key→中文 label；写失败就地报错、成功靠 revalidate 刷新。
- **Threshold**: 70

