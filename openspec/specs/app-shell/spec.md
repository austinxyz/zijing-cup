# app-shell Specification

## Purpose
为所有数据页面提供共用的视觉与导航底座：从 ai-course-management 逐值移植的设计
系统 token 与基础组件，216px 深色侧栏，以及赛季×组别的全局上下文。

赛季与组别由 URL 路径段承载（`/{season}/{division}/...`）而非客户端状态 ——
它决定的是整页规则语义（各线 cap、buffer、胜负判定、资格阈值），不只是筛选哪些
行；URL 之外再存一份就会与地址栏分歧。壳位于 layout 层而非页面内部，这样一次取数
失败只替换内容区，不会清空整个窗口。

## Requirements
### Requirement: 前端提供统一的设计系统 token 与基础组件
前端 SHALL 在 `globals.css` 中以 CSS 自定义属性定义配色、圆角与字体 token，
并提供 Button / Card / Badge / Input 四个基础组件。所有页面 MUST 通过这些 token
与组件取得视觉样式，MUST NOT 在页面中硬编码颜色值。引入这套设计系统
MUST NOT 新增任何运行时依赖。

#### Scenario: token 可用
- **WHEN** 任一页面渲染
- **THEN** 底色、前景色、边框、主色、圆角均解析自 `globals.css` 中定义的 token

#### Scenario: 基础组件可用
- **WHEN** 页面引入 Button / Card / Badge / Input
- **THEN** 组件渲染出对应变体的样式
- **AND** Button 支持 primary / secondary / ghost / danger 四种变体与 sm / md 两种尺寸

#### Scenario: 不新增运行时依赖
- **WHEN** 检查 `frontend/package.json` 的 dependencies
- **THEN** 相对本次变更前没有新增条目

### Requirement: 应用壳提供侧栏导航
前端 SHALL 提供一个所有数据页面共用的应用壳，含固定宽度的深色侧栏与导航项。
尚未实现的导航项 MUST 呈现为禁用态并标注未开放，MUST NOT 呈现为可点击但
导向空白或报错页面的链接。

#### Scenario: 当前页面在导航中高亮
- **WHEN** 访问赛制规则页
- **THEN** 侧栏中「赛制规则」项呈现为选中态

#### Scenario: 未实现的导航项不可点击
- **WHEN** 应用壳渲染
- **THEN** 「队伍」与「分析」呈现为禁用态并标注未开放
- **AND** 两项均不是可跳转的链接

#### Scenario: 页面加载失败时壳仍在
- **WHEN** 页面内容取数失败
- **THEN** 侧栏仍然渲染，只有内容区呈现错误态

### Requirement: 赛季与组别是全局上下文并由 URL 表达
应用 SHALL 以 URL 路径段表达当前赛季与组别（形如 `/2026/silver/rules`）。
赛季与组别 MUST NOT 存放于 cookie、query string 或客户端状态。
切换器 SHALL 是单一控件，一次同时选定赛季与组别。

#### Scenario: URL 决定页面上下文
- **WHEN** 访问 `/2026/gold/rules`
- **THEN** 页面展示 2026 赛季金组的规则
- **AND** 侧栏切换器显示「2026 · 金组」

#### Scenario: 切换器链接指向对应路径
- **WHEN** 应用壳渲染切换器的可选项
- **THEN** 每个可选项的目标是把当前路径中的赛季与组别段替换为该选项的链接

#### Scenario: 直接访问 URL 可复现同一页面
- **WHEN** 复制某个规则页的 URL 并在新会话中打开
- **THEN** 呈现的赛季与组别与原页面一致

#### Scenario: 未知的组别代码
- **WHEN** 访问一个不存在的组别代码路径
- **THEN** 页面呈现未找到，而不是回退到默认组别

### Requirement: 后端凭据不得进入浏览器
前端 SHALL 只在服务端读取 `BACKEND_URL` 与 `BACKEND_SECRET`，并统一经
`lib/api.ts` 调用后端。这些变量 MUST NOT 带 `NEXT_PUBLIC_` 前缀，
MUST NOT 出现在客户端构建产物中。

#### Scenario: 构建产物不含凭据
- **WHEN** 对 `frontend/` 的客户端源码执行敏感变量扫描
- **THEN** 未匹配到 `BACKEND_URL` / `BACKEND_SECRET` / `DATABASE_URL`
- **AND** 未匹配到带 `NEXT_PUBLIC_` 前缀的上述变量名

#### Scenario: 后端调用统一出口
- **WHEN** 页面需要读取后端数据
- **THEN** 调用经由 `lib/api.ts` 中的函数发起
- **AND** 没有任何客户端组件直接 fetch 后端

