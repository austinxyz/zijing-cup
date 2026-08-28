## Context

Bootstrap 已跑通 `/health` 链路，但 `zijing_cup` schema 里一张业务表都没有，
前端只有占位首页和一行 `@import "tailwindcss"`。本次是第一个纵向切片。

领域侧的完整规则见 `docs/domain/rules.md`；界面依据是 `design/` 下的设计画板
（`Rules.dc.html` / `RulesMobile.dc.html` 是本次要实现的页面，其余画板是后续 change 的）。

约束来自既有决策，本次不重新讨论：Supabase 项目与 ai-course-management 共用、
所有表在 `zijing_cup` schema、migration 是 schema 唯一来源且禁用 Alembic、
浏览器只连 Next.js、前后端之间用 `X-Backend-Secret`、不做 per-user 登录。

## Goals / Non-Goals

**Goals:**

- 规则数据模型能无损表达 2025/2026 × 金/银四套规则，且新增赛季只改 seed 不改代码。
- 设计系统与应用壳定型，后续页面直接复用。
- 一次性验证 `Next.js → FastAPI → Supabase(zijing_cup)` 承载真实业务数据。

**Non-Goals:**

- 阵容合法性校验的实现。本次存规则，不消费规则做判定。
- 规则的写入 API 与编辑界面。
- 球队/球员/名单相关的任何模型。

## Decisions

### D1. 规则拆四张表，而不是一行 JSONB

```
seasons(year PK)
  └─ divisions(season_year, code 'gold'|'silver', display_name,
               scoring_mode 'match_count'|'points',
               buffer_per_line numeric, buffer_total numeric,
               partner_gap_max numeric, mens_doubles_must_be_ordered bool)
       ├─ division_lines(division_id, code 'D1'..'WD', kind, sort_order,
       │                 cap numeric NULL, points int)
       └─ division_eligibility_limits(division_id, gender, utr_above,
                                      max_players, restricted_to_lines text[] NULL)
```

考虑过把整套规则塞进 `divisions` 的一列 JSONB。否决理由：`cap IS NULL`（开放线）
与「资格限制带线位白名单」这两件事都要能被查询和断言 —— specs 里的场景直接写成
「D1 与 MD 的 cap 为 null」。JSONB 会把这些断言变成应用层解包后才能做的事，
schema 本身不再表达任何约束。四张表的代价是多两次 join，规则数据总量是几十行，
无所谓。

`buffer_per_line` 与 `buffer_total` 存成两列而不是一列：2026 两组恰好相等
（银 0.5/0.5、金 0.3/0.3），但规则原文是分别陈述的两条约束，合并成一列等于
断言它们永远相等。2025 两列均为 0。

开放线是 `cap IS NULL`，不是大数值。金组「Buffer 只在 D2/D3/WD 之间共享」
不需要单独字段 —— 它是 `cap IS NULL` 的推论：没有上限的线不可能超出上限。

### D2. seed 用 TOML + `tomllib`，一个文件一套规则

`backend/seeds/rules/{year}-{division}.toml`，四个文件。选 TOML 而非 JSON/YAML：
`tomllib` 是 Python 3.11+ 标准库（零新依赖），且支持注释 —— 每条规则旁边贴规则
原文出处，一年后回看才知道 10.25 是从哪来的。JSON 不能写注释；YAML 要引入 PyYAML。

拆成四个文件而非一个大文件：规则是按 (赛季, 组别) 整体变更的，一年一次新增一个
赛季就是新增两个文件，diff 干净。

### D3. 导入命令做「读全量 → 比对 → 写差异」，`--check` 复用同一段比对

`python -m app.seeds.load_rules [--check]`。实现分三步：解析 seed → 从 DB 读当前
状态 → 计算差异。`--check` 在算完差异后打印并按差异是否为空决定退出码；
默认模式则把差异写入。两条路径共用同一个比对函数，避免出现「check 说一致、
导入却写了东西」这种最坏情况。

幂等靠比对而非 upsert 语义：先比对再决定是否写，能顺带产出「哪几个字段变了」
的输出，这正是 `--check` 需要的。

考虑过用 `INSERT ... ON CONFLICT DO UPDATE` 无脑覆盖。否决：那样每次执行都会
更新时间戳、无法回答「有没有变」，`--check` 就得另写一套逻辑。

删除语义：seed 中不存在但 DB 中存在的行按删除处理（例如某年某组取消一条线）。
这让 seed 真正成为唯一事实来源，而不是只增不减的叠加。

### D4. 后端分层沿用既有结构，规则查询是一次组装

`app/models/rules.py`（SQLModel 定义）、`app/rules.py`（查询与组装）、
`app/routers/rules.py`（路由）。端点一次取出组别 + 线 + 资格限制并组装为一个响应体，
不做 N+1。规则数据量小且几乎不变，本次不加缓存 —— 过早缓存会掩盖链路问题。

### D5. 前端路由 `app/[season]/[division]/rules/page.tsx`，壳在 `[division]` 层

```
app/
  layout.tsx                     根 layout：字体与 globals.css
  [season]/[division]/
    layout.tsx                   应用壳：侧栏 + 切换器（读路由参数）
    rules/page.tsx               Server Component，经 lib/api.ts 取数
    rules/error.tsx              后端不可达的错误态
```

壳放在 `[division]` 层而不是页面里：`error.tsx` 与 `loading.tsx` 替换的是它们
**下方**的内容，壳如果在页面内部，一次取数失败会把整个窗口清空 —— 这是
ai-course-management 踩过的坑，直接沿用它的结论。

切换器的选项是链接（替换路径中的 season/division 段），不是客户端状态。
组别代码在 URL 里用 `gold`/`silver`，展示名从数据库的 `display_name` 取。

首页 `app/page.tsx` 重定向到库中最新赛季的银组规则页。

### D6. 「较上一赛季」在后端算还是前端算 —— 放前端

规则页要标注相对上一赛季的变化。选择让页面额外请求一次上一赛季的规则，在
Server Component 里做比对。理由：这是展示层关注点，后端端点保持「一个赛季组别
一份规则」的干净语义；上一赛季不存在时只是少一次请求，不需要后端处理缺失分支。

代价是多一次后端往返。规则数据极小，可接受。

## Risks / Trade-offs

- **seed 与 DB 漂移**（改了 seed 忘了导入，排阵按旧 cap 算）→ `--check` 模式 +
  纳入 CI；`--check` 与导入共用比对函数，不会出现两套判断。
- **migration 把表建进 `public`**（`postgres` 角色的默认 search_path 不含
  `zijing_cup`，不加限定的 `create table` 会静默落到对方应用的 schema）→
  migration 首行 `set search_path to zijing_cup, public;`，且 `openspec/config.yaml`
  已有 grep 校验拦截无限定 DDL；本次额外在测试中断言表位于 `zijing_cup`。
- **删除语义误伤**（seed 少写一条线，导入就把 DB 里那条删了）→ 导入前打印将要
  删除的行数与内容；四套规则总共几十行，diff 可人工过目。
- **两个 capability 一次做完，change 偏大** → tasks 按 capability 分组，
  app-shell 组不依赖规则数据即可完成，规则页组建立在两者之上。
- **前端「较上一赛季」多一次往返** → 数据量极小；若将来赛季数增多再考虑后端聚合。
- **设计系统抄错数值**（取整或凭印象）→ 逐项对照 ai-course-management 源码；
  token 值在 review 时按文件对照，不靠肉眼比色。

## Migration Plan

**部署顺序**：migration → 导入 seed → 后端 → 前端。前端在后端上线前访问规则页
会走 `error.tsx` 错误态，不会崩。

**Migration 内容**：新增一个 `supabase/migrations/<timestamp>_create_competition_rules.sql`，
首行 `set search_path to zijing_cup, public;`，建四张表与外键、必要索引
（`divisions(season_year, code)` 唯一、`division_lines(division_id, code)` 唯一）。

**回滚**：本次全部是新增，无既有数据依赖。回滚 = 一个反向 migration
`drop table` 四张表（按外键反序：eligibility_limits → lines → divisions → seasons）。
不会影响 `public` schema，也不影响同库的 ai-course-management。前端与后端回滚到
上一个部署即可，`/health` 不依赖本次任何表。

**数据安全**：规则表不含任何个人数据，seed 内容来自公开规则文档，可安全提交仓库。

## Open Questions

无。规则原文本身的两处歧义（「三线男双不能田忌赛马」的判定方式、金组 4:4 平的
第一级抢先在排阵阶段不可得）已记录在 `docs/domain/rules.md` 的「待澄清」，
本次只存储不消费，不阻塞实现。
