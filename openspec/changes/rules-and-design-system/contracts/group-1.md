# Contract — group 1: 设计系统 token 与基础组件

- **Spec**: 前端 SHALL 在 `globals.css` 中以 CSS 自定义属性定义配色、圆角与字体 token，并提供 Button / Card / Badge / Input 四个基础组件。所有页面 MUST 通过这些 token 与组件取得视觉样式，MUST NOT 在页面中硬编码颜色值。引入这套设计系统 MUST NOT 新增任何运行时依赖。
- **Runtime**: `cd frontend && npm run test` → expected: 组件与 token 相关测试全部通过，无 TypeScript 报错
- **Code**:
  - token 数值逐项取自 `ai-course-management/frontend/app/globals.css`，不取整、不凭印象（design.md「设计系统抄错数值」风险项）
  - `cn` 是手写的 4 行实现，不引入 clsx / tailwind-merge；Tailwind v4 用 `@theme inline` 暴露 token
  - 组件 API 与 ai-course-management 保持一致：Button 有 primary/secondary/ghost/danger × sm/md
- **Threshold**: 80
