# Contract — group 5: 应用壳与赛制规则页

- **Spec**: 前端 SHALL 提供一个所有数据页面共用的应用壳，含固定宽度的深色侧栏与导航项。尚未实现的导航项 MUST 呈现为禁用态并标注未开放，MUST NOT 呈现为可点击但导向空白或报错页面的链接。 / 应用 SHALL 以 URL 路径段表达当前赛季与组别（形如 `/2026/silver/rules`）。赛季与组别 MUST NOT 存放于 cookie、query string 或客户端状态。切换器 SHALL 是单一控件，一次同时选定赛季与组别。 / 前端 SHALL 只在服务端读取 `BACKEND_URL` 与 `BACKEND_SECRET`，并统一经 `lib/api.ts` 调用后端。 / 前端 SHALL 在 `/{season}/{division}/rules` 展示该赛季该组别的完整规则，数据经由 Server Component 从后端取得。 / 赛制规则页面 SHALL 在同组别存在上一赛季规则时，标注本赛季相对上一赛季发生变化的项。
- **Runtime**: `cd frontend && npm run test` → expected: 壳、切换器链接、规则页渲染与错误态测试全部通过
- **Code**:
  - 壳放在 `app/[season]/[division]/layout.tsx`，**不要放进页面内部** —— `error.tsx` / `loading.tsx` 替换的是其下方内容，壳在页面里会导致一次取数失败清空整个窗口（design.md D5，ai-course-management 踩过）
  - 切换器选项是链接（替换路径中的 season/division 段），不是客户端状态
  - 「较上一赛季」在前端比对：页面额外请求一次上一赛季规则，上一赛季不存在时不显示对比且不报错（design.md D6）
  - 组别代码 URL 用 `gold`/`silver`，展示名取自数据库 `display_name`
- **Threshold**: 70
