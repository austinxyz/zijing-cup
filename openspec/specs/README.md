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

### `team-roster` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为队长，我想把组委会总表里的名单一次导进来、之后按赛季和组别查，而不是每次排阵都去 Google Sheet 里翻；作为组织者，我想在导入时就知道哪些行没读懂、哪些队人数不对，而不是等排阵算出怪结果才发现名单缺了人。

**覆盖需求**: docs/superpowers/specs/2026-08-28-roster-import-requirements.md（名单数据模型、CSV 导入与字段归属、对账报告、只读查询）

**后台**: `zijing_cup` schema 下两张表 —— `teams` / `roster_entries`。**没有 `players` 表**：总表里没有任何字段能证明「2025 银组的张三」和「2026 金组的张三」是同一个人，凭姓名归并会把它猜错，所以名单行是终态记录，唯一键 `(赛季, 组别, 球队, 姓, 名)`。`is_borrowed_player` 是三态可空布尔且**无默认值** —— NULL 读作「没人标过」，与 false（「确认不是外援」）是不同的断言，而外援有每队与每场的人数上限，这个区别决定一套阵容到底有没有被真正检查过。

解析与导入分离：`app/rosters/parse.py` 是纯函数（文本进，记录与报告出），`load.py` 走「解析 → 读库 → 比对 → 只写差异」，`--check` 复用同一个比对函数。导入只覆盖 CSV 拥有的五个字段（`gender` / `match_utr` / `dutr_status` / `source_note` / `daily_utrs`）—— 外援标记与 UTR 档案链接由人手工维护，整行重写会把它们清掉。

总表是工作文档而非导出格式，解析器有一半工作是**说出它读不懂的东西**：表头不在第 1 行（前有空行与两行脚注，按内容在前 20 行内定位）；合并单元格脚注漏成了数据行（`Borrowed Player` / `Unrated/Projected/Appeal` 两个伪队名跳过并报告）；取样列日期逐年变（按前缀匹配）；取样格里可能写着 `Early Lock` 这类文字注记（跳过该次取样、**保留球员**，按球员合并后报告 —— `Match UTR` 才是权威值，为一个佐证列丢掉一名真实球员是错的取舍）。`NaN` 反而整行拒绝：它能被 `Decimal` 解析，进库后与任何 cap 比较都返回 false，一条含 NaN 的阵容会看起来通过了所有限制。

评级类别只在能判定时判定：`Rated`→已认证、`Projected`→委员会审定，`Unrated` 留 NULL —— 它属于第 2 类还是第 3 类取决于该队员有无 USTA 比赛历史，总表不带这个信息，猜一个就等于替人决定了谁占用「场上至多 2 名自评级」的名额。

HTTP 侧只读：`GET /api/seasons/{year}/divisions/{code}/teams`（含 `player_count`，一次分组查询，无 N+1）与 `.../teams/{team_code}/roster`。**没有任何写入端点** —— 本项目不做 per-user 登录，一个公开的写接口等于谁都能覆盖所有队的名单，测试断言 OpenAPI 里不存在写方法。

**前台**: 本次无。两条端点已上线待 `roster-display` 消费。

**验收标准**: 2025 赛季金组 6 队 120 人、银组 18 队 339 人落库；两个伪队名不出现在球队表；重复导入报告无变化且不产生重复行；导入器一次都不写 `is_borrowed_player`；`Unrated` 行的 `rating_class` 为 NULL 而非猜测值；名单 CSV 不进版本库（`custom_verification_checks` 按内容扫描前 20 行拦截）。

---

## 规划中的能力（路线图）

| 能力 | 说明 | 状态 |
|---|---|---|
| `roster-display` | 前端浏览球队/球员/UTR（后端 `team-roster` 的两条端点已就绪） | 📋 规划中 |
| `lineup-engine` | 移植 MatchApp 策略模式阵容优化引擎（Top-5 候选阵容、逐线 cap + 全局 buffer 预算、固定搭档）。田忌赛马判定已定（三线男双 UTR 和非递增，相等不算违规）；开工前仍需组委会澄清 `Unrated` 分类、`/ Appeal` 语义、金组 4:4 抢七判定三项 | 📋 规划中 |
| `lineup-ui` | 前端锁定搭档 + 阵容对比交互界面 | 📋 规划中 |

> `project-bootstrap` 已随 bootstrap 完成并部署，但未走 opsx change 流程，故无归档 spec。
