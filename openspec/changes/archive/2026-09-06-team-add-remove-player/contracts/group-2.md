### Contract
- **Spec**: team-roster-ui —— 「队伍页编辑模式提供『加入队员』控件（搜现有 / 建新人）」及其 scenarios；「编辑模式下名单每行提供『移出』…就地确认」及其 scenarios；「控件 MUST NOT 在查看模式或未解锁本比赛时出现」；「后端拒绝就地显示 detail」。
- **Runtime**: `cd frontend && npm run test -- teams` → expected: TeamEditPanel 加入/移出交互单测过；`npx tsc --noEmit` 干净。
- **Code**: 加入控件（搜索输入 + 结果列「加入本队」+ 「新建」姓/名/性别 表单）与每行「移出」+ 就地确认，接 group 1 的 server actions；只在 `TeamEditPanel` 已渲染（canEdit + 编辑模式）时出现；后端 detail 就地显示；成功依赖 `revalidatePath`/RSC 重渲染刷新，不拼本地陈旧态；`team_id` 来源见 design D3（TeamRoster 带则用，否则 getDivisionTeams 按 code 解析）。
- **Threshold**: 70

