# 能力清单

`openspec/specs/` 下每个目录是一个已归档的能力（capability）。这里维护一份清单，方便快速找到"这功能是哪个 change 做的、覆盖了什么"。

---

### `competition-rules` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为队长，我想按赛季和组别查到本组的完整赛制规则（各线 cap、buffer、分值、资格限制），排阵前不必翻公众号长文去找那几个数字；也想看到去年的规则，这样今年 cap 变了（银组混双 10.5→10.25）我能立刻知道去年那套阵容是否还合法。作为开发者，我想让这些值以数据形式存在，明年改规则改的是一个 seed 文件，而不是散落在排阵算法里的常量。

**覆盖需求**:
- docs/superpowers/specs/2026-08-27-rules-and-design-system-requirements.md（赛制规则数据模型、seed 与导入、只读查询、赛制规则页面）
- 领域依据见 docs/domain/rules.md

**后台**: `zijing_cup` schema 下四张表 —— `seasons` / `divisions` / `division_lines` / `division_eligibility_limits`。不用 JSONB，因为两件事要能被 schema 表达并查询：`division_lines.cap` 为 NULL 即金组的开放线（是另一种线，不是上限很高的线，且分值不同），`division_eligibility_limits.restricted_to_lines` 是可空 text[]，让「UTR>9.0 男队员 ≤1 名且只能打 D1/MD」这条同时带人数上限与线位白名单的规则装进一行；NULL 表示不限线位，check 约束拒绝空数组（那读作「一条线都不能打」）。`buffer_per_line` 与 `buffer_total` 分两列 —— 2026 两组恰好相等，但规则原文是两条独立约束，一列会断言它们永远相等。`mens_doubles_must_be_ordered` 只存开关，判定方式未定（见 docs/domain/rules.md「待澄清」）。

规则内容以 `backend/seeds/rules/{year}-{division}.toml` 为唯一事实来源，标准库 `tomllib` 读取（零新依赖，且能在每个数值旁贴规则原文出处）；数值写成字符串按 Decimal 精确解析 —— TOML 浮点存不下 0.30，而这些数字决定阵容合法与否。导入命令 `python -m app.seeds.load_rules` 走「解析 → 读库 → 比对 → 只写差异」，`--check` 复用同一个比对函数并转成退出码，供 CI 拦截「改了 seed 忘了导入」的漂移。seed 中消失的规则集按删除处理（否则 seed 就成了只增不减的叠加，不再是事实来源）。同赛季两个组别的 `[season]` 块不一致会在解析阶段拒绝 —— 它们共用一行 `seasons`，不一致会导致导入永不收敛。

HTTP 侧只读：`GET /api/seasons`（赛季×组别索引，驱动切换器）与 `GET /api/seasons/{year}/divisions/{code}/rules`（单组别完整规则，三次查询组装，无 N+1，不加缓存）。**没有任何写入端点** —— 规则一年改一次，走 seed 文件 + code review + 导入命令，测试断言 OpenAPI 里不存在指向规则资源的写方法。开放线序列化为 JSON null，未知赛季或组别返回 404 而非空对象。

**前台**: `app/[season]/[division]/rules/` —— Server Component 经 `lib/api.ts` 单一出口取数。开放线显示「开放线」而非数字；Buffer 卡片明说「共享预算，不是每线容差」（五线各超 0.2 合计 1.0 是非法的，这是最容易误读的一条）；记分组别多显示各线分值。「较上一赛季」在页面内比对（额外取一次上赛季规则），上一赛季不存在时正常渲染且不显示对比 —— 最早的赛季本就没有上一届，不是错误。后端不可达时走 `rules/error.tsx`，壳仍在。

**验收标准**: 四套规则（2025/2026 × 金/银）可查；金组 2026 的 D1/MD `cap IS NULL` 且分值为 1/2/2/1/2 合计 8；银组 2026 五线 cap 为 13/12/11/10.25/9.25 且 buffer 0.50；银组 2025 的 MD/WD 为 10.5/9.5 且无 buffer；导入命令幂等且 `--check` 能检出漂移；规则页对未知组别 404。

---

### `app-shell` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为队长，我想在任意页面都能一眼看到当前是哪个赛季哪个组别，并一步切到另一组；作为开发者，我想让后续页面直接复用已定型的侧栏与基础组件，而不必在每个 change 里重新决定布局与配色。

**覆盖需求**: docs/superpowers/specs/2026-08-27-rules-and-design-system-requirements.md（设计系统移植、应用壳、URL 路由约定）

**后台**: 无。本能力纯前端，数据来自 `competition-rules` 的两个只读端点。

**前台**: `frontend/app/globals.css` 的 token 块与 `components/ui/{button,card,badge,input}.tsx` —— 全部逐值移植自 ai-course-management（两个应用要看起来是一家人，重新推导出的"差不多"配色就是这件事悄悄失效的方式），零新增运行时依赖，`cn` 是手写四行。相对源项目两处有意偏离：不移植 `.dark`（本应用没有任何地方切换它，移过来就是会静默漂移的死代码）；Badge 去掉 `info`、加 `warning`，用于「合法但有代价」这一档（超 cap 但由全队 buffer 覆盖的搭档，读作 danger 是错的）。

`app/[season]/[division]/layout.tsx` 承载 216px 深色侧栏。壳在 layout 而非页面内部：`error.tsx`/`loading.tsx` 替换的是其下方内容，壳若在页面里，一次取数失败会清空整个窗口（ai-course-management 踩过）。赛季×组别切换器是原生 `<details>`：收起是一个控件标签，展开列出**全部**组合，当前项标记且不可点。选项是链接不是客户端状态 —— URL 决定哪套规则生效，React 里再存一份就会与地址栏分歧。尚未实现的「队伍」「分析」呈现为禁用态并标注「未开放」，不做成点了没反应的死键。

**验收标准**: 切换器列出所有 (赛季, 组别) 组合且集合不随选择变化；未实现导航项不是链接；后端不可达时侧栏仍渲染、仅内容区变错误态；客户端 bundle 中不含 `BACKEND_URL` / `BACKEND_SECRET`。

---

## 规划中的能力（路线图）

| 能力 | 说明 | 状态 |
|---|---|---|
| `roster-import` | 球队/球员/roster 数据模型 + UTR 取数策略（参赛 UTR 取 9/21–9/25 五日均值，与当前 UTR 分开存） | 📋 规划中 |
| `roster-display` | 前端浏览球队/球员/UTR | 📋 规划中 |
| `lineup-engine` | 移植 MatchApp 策略模式阵容优化引擎（Top-5 候选阵容、逐线 cap + 全局 buffer 预算、固定搭档）。开工前需先确认「三线男双不能田忌赛马」的判定方式 | 📋 规划中 |
| `lineup-ui` | 前端锁定搭档 + 阵容对比交互界面 | 📋 规划中 |

> `project-bootstrap` 已随 bootstrap 完成并部署，但未走 opsx change 流程，故无归档 spec。
