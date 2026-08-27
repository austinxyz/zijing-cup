# Zijing Cup Analysis — Project Bootstrap Design

Status: REVIEWED

## Context

Zijing Cup(紫荆杯)是每年一次的湾区华人校友网球团体赛，涉及20+支球队、300+球员。组织者/队长目前手动用UTR官网+Google Sheets管理球队报名、球员UTR、阵容排列，效率低、易出错。

历史上有一个功能完备的参考实现：
- 后端 [MatchApp](https://github.com/austinxyz/MatchApp)（Spring Boot + MySQL）：`ZiJingController` 提供球队/球员/赛事查询，以及基于策略模式的阵容优化引擎（给定UTR cap，搜索Top-5候选阵容，支持部分线锁定搭档）。
- 前端 [tennis-analysis-app](https://github.com/austinxyz/tennis-analysis-app)（Vue.js）："Zijing Cup Analysis"模块：球队/球员浏览、阵容对比工具。

目标是把这套能力迁移到一个新项目 `zijing-cup`，采用 `ai-course-management` 项目已验证的技术栈和opsx开发流程，而不是照搬MatchApp的Spring Boot/MySQL栈。

## Goals

- 搭好可运行、可部署的项目骨架（本次范围）
- 后续每个功能点（roster导入、展示、阵容优化引擎、阵容UI）各自作为独立opsx change迭代交付
- 复用现有Supabase项目，避免新开项目撞到free tier的2-project上限

## Non-Goals（本次不做）

- 球队/球员/UTR的实际数据模型与导入逻辑
- 阵容优化算法的移植
- 任何前端业务页面（除一个占位首页外）
- 单人对比、球员搜索、俱乐部/赛事查询等MatchApp其余功能
- 定时UTR刷新任务
- 用户登录/多租户隔离（跟ai-course-management一样，本项目不需要per-user auth）

## Architecture Decisions

### 技术栈：对齐 ai-course-management，而非照搬MatchApp

| 层 | MatchApp(参考) | zijing-cup(新) |
|---|---|---|
| 前端 | Vue.js + Tailwind + Pinia | **Next.js 15 (App Router) + TypeScript + Tailwind** |
| 后端 | Spring Boot (Java) | **FastAPI + Python 3.12 + SQLModel**，uv管理依赖 |
| 数据库 | MySQL (DigitalOcean) | **Supabase Postgres**（复用现有项目） |
| 部署 | 未知/自托管 | **Vercel(前端) + Render free tier(后端)** |

理由：复用ai-course-management已经踩过坑、跑通的架构和opsx流程，降低新项目的框架搭建成本；不引入第二套技术栈的维护负担。

### 架构铁律（照抄ai-course-management CLAUDE.md）

- 浏览器只连Next.js；Next.js Server Components/Server Actions通过`lib/api.ts`单一出口调FastAPI；只有FastAPI碰数据库
- `BACKEND_URL`/`BACKEND_SECRET`等敏感环境变量不带`NEXT_PUBLIC_`前缀，禁止泄漏到浏览器
- 前后端鉴权：共享密钥`X-Backend-Secret`中间件（fail-closed），不做per-user登录
- Supabase仅作为纯Postgres托管使用：不开RLS、关闭表的Data API自动生成开关
- Migration是schema变更唯一来源，禁用Alembic

### 与ai-course-management的偏差：Supabase Schema隔离

ai-course-management只用默认`public` schema。zijing-cup要**新建独立schema `zijing_cup`**，不用public，因为：

- 两个应用共用同一个Supabase项目（免费版一个账号最多2个active项目，已经用满，详见项目决策记录）
- Schema级隔离能避免表名冲突，权限管理更清楚
- Migration文件需要写成schema-qualified DDL（`CREATE SCHEMA IF NOT EXISTS zijing_cup;` + 表都建在该schema下）
- `DATABASE_URL`的连接串通过`search_path`或schema前缀指向`zijing_cup`，不影响另一个应用的`public` schema数据

### opsx开发流程

照搬`ai-course-management`的`.claude/commands/opsx/*.md`（explore/propose/apply/archive四阶段，通用不改）+ `openspec/config.yaml`（`context:`/`rules:`块改成网球领域描述）。参考`opsx-new-project`的`openspec/`目录结构约定。

## Bootstrap 交付物（本次scope）

1. GitHub repo `austinxyz/zijing-cup`（public）
2. `backend/`：FastAPI + uv骨架，一个`/health`端点，`db.py`按ai-course-management的fail-closed `DATABASE_URL`模式实现（额外要解析出`zijing_cup` schema）
3. `frontend/`：Next.js骨架，一个占位首页，`lib/api.ts`打通到`/health`
4. `supabase/migrations/`：第一个migration建`zijing_cup` schema + 一张占位验证表
5. `render.yaml`（backend部署配置）+ Vercel项目手动接线（域名/环境变量在控制台配置，不进repo）
6. `openspec/`、`.claude/commands/opsx/`、`CLAUDE.md`、`docs/requirements.md`（记录本文档摘要的顶层需求）、`docs/log/`
7. 一次手动验证：本地跑通frontend→backend→Supabase(zijing_cup schema)的完整链路

## 后续Change路线图（不在本次scope内，仅记录顺序）

1. `roster-import` — 球队/球员/roster数据模型 + UTR数据同步策略（Supabase快照 vs 实时拉取，待定）
2. `roster-display` — 前端浏览球队/球员/UTR
3. `lineup-engine` — 移植MatchApp策略模式阵容优化引擎（Top-5候选阵容、UTR cap计算、固定搭档搜索）
4. `lineup-ui` — 前端锁定搭档+对比阵容交互界面
5. 视需要：定时UTR刷新任务、单人对比、球员/俱乐部/赛事搜索等MatchApp其余功能

## Open Questions

- UTR数据获取策略（Supabase快照定期同步 / 服务端实时调用 / 混合）留到`roster-import` change时再定
- 是否需要队长登录后才能编辑（vs 现在的公开可读）留到后续视需要再加
