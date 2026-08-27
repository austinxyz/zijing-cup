# Zijing Cup Analysis — 顶层需求

Status: DRAFT（种子文档，各capability的详细需求由各自的`/opsx:explore`产出）

## 背景

Zijing Cup(紫荆杯)校友网球团体赛每年20+支球队、300+球员参赛。目前组织者/队长靠手动查UTR官网+维护Google Sheets管理球队报名、球员资格、阵容排列，效率低、易出错、无历史沉淀。

历史参考实现：
- 后端 [MatchApp](https://github.com/austinxyz/MatchApp)（Spring Boot + MySQL）
- 前端 [tennis-analysis-app](https://github.com/austinxyz/tennis-analysis-app) 的 "Zijing Cup Analysis" 模块

本项目把这套能力迁移到Next.js + FastAPI + Supabase技术栈，对齐`ai-course-management`的架构与opsx开发流程。

## 角色

- **队长(Captain)**：管理自己队伍的roster，查看/试排阵容
- **球员(Player)**：查看自己和其他球员的UTR、比赛记录
- **组织者(Organizer)**：查看全部球队/球组情况，跨队对比

## 架构（详见 [2026-08-27-project-bootstrap-design.md](superpowers/specs/2026-08-27-project-bootstrap-design.md)）

Next.js 15 → FastAPI → Supabase Postgres（独立schema `zijing_cup`，与现有项目共享同一Supabase实例）。部署：Vercel(前端) + Render free tier(后端)。无per-user登录，共享密钥前后端鉴权。

## Capability 路线图

每个capability是一个独立的opsx change，按下列顺序迭代：

### 0. project-bootstrap（本次已完成）
项目骨架：repo、FastAPI/Next.js最小可运行版本、Supabase schema接通、Vercel+Render部署配置、opsx流程文件。不含任何业务数据模型。

### 1. roster-import
球队/球员/roster数据模型。确定UTR数据获取策略（Supabase快照定期同步 / 服务端实时调用 / 混合，待该change的`/opsx:explore`阶段定夺）。覆盖：球队信息、球员基本信息、双打UTR（含Rated/Projected/Unrated状态、去年override逻辑）、外援/联队标记。

### 2. roster-display
前端页面：浏览全部球队与分组、单个球队的roster详情（球员列表+UTR+qualified状态）、球员搜索。

### 3. lineup-engine
移植MatchApp的策略模式阵容优化引擎：
- 给定球队与UTR cap（各线上限+buffer），自动搜索Top-5候选阵容组合
- 支持部分线锁定搭档（fixed pairs），其余线自动搜索最优
- 支持"是否使用去年override UTR"的开关（对应MatchApp的`grantUTR`参数）

### 4. lineup-ui
前端交互界面：选队伍、锁定/解锁某条线的搭档、查看Top-5候选阵容对比、导出/分享阵容方案。

### 5+. 待定（视需要）
- 定时UTR刷新任务
- 单人对比（Single Player Analysis）
- 俱乐部/赛事查询
- 球员Finder（按UTR/USTA等级/年龄/性别/地区筛选）

## 验收标准（顶层，非单个change粒度）

- 组织者能在网页上看到当年所有报名球队及其roster，不用再手动维护Google Sheets
- 队长能自助试算阵容，无需人工按UTR cap反复手算配对
- 系统能追溯球员UTR历史（对应现在手动维护的`utr-history.md`）

## Out of Scope（长期）

- 手机App
- 比赛比分记录/实时直播（UTR官方已覆盖）
- 队员个人账号登录与权限体系（除非未来明确需要）
