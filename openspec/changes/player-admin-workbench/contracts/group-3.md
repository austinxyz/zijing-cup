### Contract
- **Spec**: player-admin-ui —— 「队员管理页有查看/编辑双模式，查看任人可读」（任何人只读进入、不重定向；`canEdit` 判编辑；解锁出开关；查看模式隐所有写控件）；MODIFIED「未登录时管理界面不是死入口」（改为只读查看 + 就地解锁入口）。
- **Runtime**: `cd frontend && npm run test -- players` → expected: 页面/布局/头控件的模式与 gate 单测过；`npx tsc --noEmit` 干净。
- **Code**: 新 `PlayerEditContext`（`{canEdit, editing, setEditing}`，**默认 editing=false**——合并/拆分不可逆，默认只读更稳）+ `PlayerEditHeaderControl`（镜像 `TeamEditHeaderControl`：未 canEdit→`EditModeToggle` 带 season/division；canEdit→编辑/查看开关+登出）；`players/layout.tsx` **去掉 canEdit 重定向**改 pass-through；写控件按 `editing` 显隐。跨 server→client 边界只传序列化 server action + `canEdit` 数据，不传 render-prop 函数（既有 pitfall）。
- **Threshold**: 70

