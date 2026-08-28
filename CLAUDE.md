# Zijing Cup Analysis

紫荆杯校友网球团体赛的球队/球员/UTR数据管理与阵容优化工具。取代目前手动维护
UTR官网查询 + Google Sheets的流程。需求见 `docs/requirements.md`；架构决策见
`docs/superpowers/specs/2026-08-27-project-bootstrap-design.md`。

## 架构（不可违反）

- 浏览器只与 Next.js 通信；Next.js Server Components/Server Actions 通过
  `frontend/lib/api.ts` 单一出口调用 FastAPI；只有 FastAPI 能访问数据库。
- `backend/app/auth.py` 的共享密钥中间件默认保护所有路由——新路由不用额外
  声明就是受保护的；只有 `/health` 显式豁免（Render 平台健康检查发不出自定义
  header）。
- Supabase 仅作为纯 Postgres 托管使用：不开 RLS，不用自动生成的 REST API。
- **本项目与另一个应用共享同一个 Supabase 项目**（`randyudbxqfdqrvgkmmc`）。
  所有表、migration 都必须显式指定 `zijing_cup` schema，绝不能建在 `public`
  下——那是另一个应用的数据。这条规则有两个独立的强制点，缺一不可：
  - 应用查询：`backend/app/db.py` 的 `SCHEMA` 常量和 `search_path` 设置。
  - Migration DDL：每个 migration 文件必须以 `set search_path to zijing_cup, public;`
    开头，或者把每个对象都写成 `zijing_cup.<name>` 全限定名——`supabase db push`/
    `db reset` 是以 `postgres` 角色的默认 search_path 执行 DDL 的，`db.py` 的
    search_path设置管不到这条路径。
- Migration 是 schema 变更唯一来源（`supabase/migrations/*.sql`），不用
  Alembic 或任何 ORM 自动迁移。
- **禁止对远程共享项目跑 `supabase db push` / `supabase migration repair`**。
  CLI 的 migration 追踪表是整个 Supabase 项目共用的，不是按 schema 分的；
  这个远程项目里已经有 ai-course-management 那个 app 的 migration 历史
  （本 repo 里没有那些文件），`db push` 会报错要求 `migration repair`，但
  repair 会把对方的 migration 标记成 reverted，可能搞坏它自己的部署流程
  （它的 GitHub Action 每次 push main 都会跑 `db push`）。
  正确做法：本地开发继续用 `supabase start` + `supabase db reset` 跑本地
  stack；要把 migration 应用到远程共享项目时，去 Supabase Dashboard 的
  SQL Editor 手动执行 migration 文件里的 SQL，不要用 CLI 的 push/repair
  碰这个共享项目。

## 技术栈与部署

| 层 | 技术 | 部署 |
|---|---|---|
| 前端 | Next.js 16 + TypeScript + Tailwind v4 | Vercel |
| 后端 | FastAPI + Python 3.12 + SQLModel，uv管理依赖 | Render (free tier) |
| 数据库 | Supabase Postgres，`zijing_cup` schema | 共享 Supabase 项目 |

Render免费版会在闲置后休眠，冷启动可能要接近1分钟——`frontend/lib/api.ts`
的fetch要留足超时时间，不要假设后端总是热的。

## 认证

不做多用户登录/隔离。前后端之间用共享密钥（`BACKEND_SECRET`环境变量，
经`X-Backend-Secret` header传递）。如果未来需要队长/球员分级权限，
这是一个明确要重新设计的点，不要在现有共享密钥模型上打补丁。

## 开发流程

用opsx四阶段：`/opsx:explore` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`。
配置见`openspec/config.yaml`。

## Pitfalls

- 本机(austin的Windows开发机)有Application Control安全策略，`uv run uvicorn ...`直接调uvicorn.exe会被拦(`os error 4551`)。改用`uv run python -m uvicorn app.main:app ...`绕过——通过python解释器跑module而不是直接执行独立可执行文件。Render上是Linux容器，不受此限制，`render.yaml`按原计划保留`uv run uvicorn`即可，仅本地开发要注意这条。
- 本机8000端口经常被其他项目占用，本地跑backend建议换个端口(比如`--port 8010`)，`frontend/.env.local`的`BACKEND_URL`跟着改。
- **测试会清空规则表与名单表——别让`DATABASE_URL`指着生产库跑pytest。** `backend/tests/`的fixture在拆解时`TRUNCATE`四张规则表以及`teams`/`roster_entries`。`app/db.py`用`load_dotenv()`默认`override=False`，即**已存在的环境变量优先于`backend/.env`**——这正是`$env:DATABASE_URL='<远程串>'`能让导入命令打远程的原因，也意味着同一个shell窗口里接着跑`uv run pytest`会清空线上规则数据。导完远程立刻`Remove-Item Env:\DATABASE_URL`(PowerShell)或`unset DATABASE_URL`，或干脆换个窗口跑测试。
- 手动在Dashboard执行migration(见上面的no-CLI-push规则)意味着远程`supabase_migrations`表里没有这次记录。这是那条规则的既定代价，不是新问题，但别指望远程的migration历史是完整的。
- `openspec status`会一直把`requirements`和`mocks`显示成未完成。schema里这两个产物的`generates`路径写的是字面量`{{date}}`，CLI不做替换，存在性检查永远匹配不上；文件其实在带日期的路径下。同样的原因会让新建change时所有产物一开始都显示blocked——`openspec instructions`照常输出，可以往下走。
- 审计路由不要遍历`app.routes`。当前FastAPI版本把`include_router`存成单个不透明的`_IncludedRouter`条目，不把子路由摊平，遍历它会**看不见任何`/api`路由**而静默通过。用`app.openapi()["paths"]`，并配一条"读路由确实注册了"的断言防止守卫再次空转。
- 上面那条TRUNCATE还有个本地的连带后果：跑完`pytest`本地库的规则表就空了，此时任何名单导入都会以`no division 'silver' in season 2025`失败。先`uv run python -m app.seeds.load_rules`补回规则再导名单——报错信息本身已经这么提示，但连着跑两条命令时很容易误读成导入器坏了。
- **Google Sheets导出的CSV表头不在第1行。** 前面有一个空行、两行合并单元格脚注、再一个空行，列名在第5行；第1行是`,,,,,,,,,,,,,`。任何"读第1行判断这是不是名单文件"的逻辑都会静默失败：解析器会把整份文件判成不可读（看起来像空名单，不像读错了），而按内容识别的安全扫描会对一份真实名单报clean。解析和扫描都要在前若干行内找表头（`parse.py`的`HEADER_SEARCH_LIMIT`=20，`config.yaml`的真实数据扫描用`head -20`）。
- **别拿抓取来的表格markdown当事实源。** Drive/网页抓取会静默截断：一次银组名单只回了11支队，据此写进requirements的"13队211人"、"5支球队有排名却没名单"、"`SJTU`只有1行"三条全是假的（实际18队339人，那5支队各有17-26人）。真实导出一跑就全推翻了。凡是要写进验收标准的数量，用真实导出文件核对过再写。
