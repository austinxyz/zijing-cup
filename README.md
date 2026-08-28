# 紫荆杯 · 球队与阵容分析

紫荆杯校友网球团体赛的赛制规则、球队名单与阵容排布工具。取代目前用 UTR 官网查询 +
Google Sheets 手工维护的流程。

- 前端（Vercel）: https://zijing-cup-frontend.vercel.app/
- 后端（Render）: https://zijing-cup-api.onrender.com/health

> Render 免费实例闲置后会休眠，冷启动接近一分钟。第一次访问慢是正常的。

## 现在能做什么

**赛制规则** —— 按赛季与组别查看完整规则：各线 UTR Cap、Buffer 额度、各线分值、
上场资格限制、通用阵容约束，并标注相对上一赛季的变化。

紫荆杯每年一届、分金银两组，两组规则不同且逐年调整（银组混双 Cap 2025 是 10.5、
2026 变成 10.25；Buffer 是 2026 才有的制度；金组 2026 起改记分制）。所以这些值全部
按 `(赛季, 组别)` 存为数据，没有一个写在代码里 —— 明年改规则改的是一个 seed 文件。

赛季与组别在 URL 里：`/2026/silver/rules`、`/2026/gold/rules`。

**还没做**：球队/球员名单、UTR 同步、阵容优化引擎与对比界面。侧栏里「队伍」「分析」
是禁用态，路线图见 [openspec/specs/README.md](openspec/specs/README.md)。

## 本地跑起来

需要 Docker（Supabase 本地栈）、Node 20+、[uv](https://docs.astral.sh/uv/)。

```bash
# 1. 数据库：起本地 Supabase 栈并应用 migration
supabase start
supabase db reset

# 2. 后端
cd backend
cp .env.example .env          # 本地默认值已填好
uv sync
uv run python -m app.seeds.load_rules    # 导入四套赛制规则
uv run python -m uvicorn app.main:app --port 8010

# 3. 前端（另开一个终端）
cd frontend
cp .env.example .env.local    # BACKEND_URL 改成 http://127.0.0.1:8010
npm install
npm run dev
```

打开 http://localhost:3000 ，会重定向到当前赛季的银组规则页。

### 测试

```bash
cd backend && uv run pytest        # 需要本地 Supabase 栈在跑
cd frontend && npm run test
```

> **后端测试会 TRUNCATE 规则表。** 跑之前确认 `DATABASE_URL` 没有指向远程共享项目 ——
> 详见 [CLAUDE.md](CLAUDE.md) 的 Pitfalls。

## 结构

```
backend/          FastAPI + SQLModel，唯一能访问数据库的一层
  app/models/     规则表的 ORM 映射
  app/seeds/      TOML seed 导入命令（幂等，带 --check 漂移检测）
  seeds/rules/    赛制规则的唯一事实来源，一个赛季组别一个文件
frontend/         Next.js App Router；lib/api.ts 是调后端的唯一出口
supabase/         migration，schema 变更的唯一来源
design/           设计画板源文件（.dc.html）
docs/domain/      领域模型：赛制规则与待澄清的规则歧义
openspec/         opsx 四阶段开发流程的 change 与能力 spec
```

架构铁律（浏览器只连 Next.js、只有 FastAPI 碰数据库、所有表在 `zijing_cup` schema、
共享 Supabase 项目禁用 CLI push）见 [CLAUDE.md](CLAUDE.md)。

规则本身的依据与两处待组委会确认的歧义见 [docs/domain/rules.md](docs/domain/rules.md)。
