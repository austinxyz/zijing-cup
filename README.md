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

**球队名单** —— 按赛季与组别浏览各队名单：左边是球队列，右边是选中队的球员与参赛 UTR，
按强弱排好。`/2025/silver/teams`、`/2025/silver/teams/PKU`。

球队列显示的是人数与男/女构成，不是队伍平均 UTR。因为一场比赛要 1 名女子打混双、
2 名打女双，场上至少 3 名女队员是硬约束，而 26 人名单的平均值跟真正上场的 8 个人
关系不大 —— 2025 金组 `JNU-UCLA` 恰好只有 3 名女队员，一人退赛就凑不出阵容。

名单里的「UTR 来源」同时给出判定与总表原文。评级类别判不出来时显示**「待定」**，
不显示「自评」：`Unrated` 属于第二类还是第三类取决于该队员有无 USTA 比赛历史，
总表不带这个信息，页面替它下结论就等于决定了谁占用「场上至多 2 名自评级」的名额。
2025 全部 459 行里有 36 行是这个状态，等组委会澄清。

**还没做**：UTR 同步（页面上的参赛 UTR 是赛前冻结值，不是实时评分）、阵容优化引擎与
对比界面、移动端版式。侧栏里「分析」是禁用态，路线图见
[openspec/specs/README.md](openspec/specs/README.md)。

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

# 名单需要组委会总表导出的 CSV，放到 backend/data/rosters/（该目录已 gitignore，
# 内含真实姓名与 UTR，不进版本库；导出方法见该目录的 README）
uv run python -m app.rosters 2025 gold data/rosters/2025-gold.csv
uv run python -m app.rosters 2025 silver data/rosters/2025-silver.csv
uv run python -m app.seeds.team_names    # 球队中文名（可选，不导则只显示 code）

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

> **后端测试会 TRUNCATE 规则表与名单表。** 跑之前确认 `DATABASE_URL` 没有指向远程
> 共享项目 —— 详见 [CLAUDE.md](CLAUDE.md) 的 Pitfalls。
>
> 跑完本地库就空了，页面会全是 404。用 `bash backend/scripts/reseed-local.sh` 按依赖
> 顺序补回三份 seed（该脚本拒绝对非本地库运行）。

## 结构

```
backend/          FastAPI + SQLModel，唯一能访问数据库的一层
  app/models/     规则表与名单表的 ORM 映射
  app/rosters/    总表 CSV 的解析与导入（只覆盖 CSV 拥有的字段）
  app/seeds/      TOML seed 导入命令（幂等，带 --check 漂移检测）
  scripts/        reseed-local.sh —— 跑完测试后补回本地数据
  seeds/rules/    赛制规则的唯一事实来源，一个赛季组别一个文件
  seeds/team_names/  球队中文名，同上；只列有自然叫法的队
  data/rosters/   名单 CSV 落脚处（gitignore，含真实个人数据）
frontend/         Next.js App Router；lib/api.ts 是调后端的唯一出口
supabase/         migration，schema 变更的唯一来源
design/           设计画板源文件（.dc.html）
docs/domain/      领域模型：赛制规则，以及规则原文歧义的澄清结论
openspec/         opsx 四阶段开发流程的 change 与能力 spec
```

架构铁律（浏览器只连 Next.js、只有 FastAPI 碰数据库、所有表在 `zijing_cup` schema、
共享 Supabase 项目禁用 CLI push）见 [CLAUDE.md](CLAUDE.md)。

规则本身的依据，以及原文四处歧义的澄清结论（含「为什么外援限制先不判定」），见 [docs/domain/rules.md](docs/domain/rules.md)。
