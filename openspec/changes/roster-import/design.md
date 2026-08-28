## Context

`competition-rules` 已上线，规则侧齐备。本次补上被规则约束的对象：球队与球员名单。

数据源是 2025 年组委会的 UTR 总表（Google Sheets）。已实地核查过内容，它**不是**
一份干净的名单：

- 合并单元格的脚注漏成了数据行，`Team` 列出现 `Borrowed Player` 与
  `Unrated/Projected/Appeal` 两个伪队名，内容是中文说明文字
- 银组 `SJTU` 只有 1 行，实为排名表备注 `8.02 Excluded (No Pair)` 对应的那名被排除
  球员，不是名单
- 球队清单在各 tab 之间对不上：5 队有排名无名单、2 队有名单无排名，赛后 tab 还有
  赛前 tab 没有的队
- 没有 UTR profile ID，只有 `Last Name` / `First Name`，且含别名噪音

约束沿用既有决策：`zijing_cup` schema、migration 唯一来源、只有 FastAPI 碰数据库、
无 per-user 登录。领域依据见 `docs/domain/rules.md`。

## Goals / Non-Goals

**Goals:**

- 名单能被 `roster-display` 与 `lineup-engine` 直接使用：查得到球队、查得到每人的
  参赛 UTR。
- 导入可重复执行且能检出漂移，与 `load_rules` 同形状。
- 导入**说出**数据源对不上的地方，而不是给出一份看起来完整的名单。

**Non-Goals:**

- 阵容判定、UTR 抓取、前端页面。
- **从总表识别外援**——总表做不到。外援字段本次建出来，值由人工设置。

## Decisions

### D1. 两张表：球队与名单条目，名单条目不指向「球员」实体

```
teams(id, season_year, division_code, code, unique(season_year, division_code, code))
  └─ roster_entries(id, team_id, last_name, first_name, gender,
                    match_utr, dutr_status, rating_class NULL,
                    source_note NULL, daily_utrs numeric[],
                    utr_profile_id NULL, is_borrowed_player NULL,
                    unique(team_id, last_name, first_name))
```

**没有 `players` 表。** 名单条目就是终点，不指向一个跨赛季的球员实体。

理由：总表没有 UTR profile ID，跨赛季识别同一人只能靠姓名，而姓名不足以证明同一性
（2025 按姓名比对有 23 人同时出现在金银两组）。建一张 `players` 表就必须回答「这两行
是不是同一个人」，而数据回答不了 —— 那会逼出一个基于姓名的自动归并，把猜测固化成
外键。排阵需要的是「这个赛季这支队这个人的参赛 UTR」，快照足够。

`utr_profile_id` 是名单条目上的可选列，不是一张关联表。填了它就等于人工断言了同一性；
没填就什么都不断言。将来若要做跨赛季球员档案，从这一列长出去即可，不必先建实体。

考虑过建 `players` + `roster_entries` 两层。否决理由如上：为一个数据无法支撑的概念
预留结构，代价是每次导入都要面对一个无解的匹配问题。

### D1b. 字段分两类归属：CSV 拥有的，与人工拥有的

三个字段不来自 CSV，由人工维护：

| 字段 | 谁写 | 为什么不在 CSV 里 |
|---|---|---|
| `is_borrowed_player` | 人工 | 总表无法识别外援，只有一条漏成数据行的脚注提到 |
| `utr_profile_id` | 人工 | 总表没有这一列；填它等于人工断言跨赛季同一性 |
| `rating_class`（`Unrated` 行） | 人工 | 类别取决于有无 USTA 比赛历史，不在总表中 |

这直接约束导入器：**比对与写入只覆盖 CSV 拥有的字段**。若按整行比对重写，
每次重导都会把人工设过的外援标记清回默认、抹掉 profile 关联、把回填的评级类别
打回 NULL——而导入是每次名单更新都要跑的操作，这种清除会反复发生且无声。

`rating_class` 是混合归属的特例：导入器只在能判定时写它（`Rated` / `Projected`），
对 `Unrated` **一次都不碰这一列**，无论其中是 NULL 还是人工填的值。

`is_borrowed_player` 用可空布尔而非 `not null default false`：未标注与「确认不是外援」
是两回事。规则对外援有名额限制，把「没人标过」呈现为「没有外援」会让下游算出一个
看起来通过、实则未经检验的结论。

`--check` 的比对同样只看 CSV 拥有的字段，否则人工设一个外援标记就会让漂移检测永远报红。

### D2. 每日 UTR 值存数组，不建单独的表

`daily_utrs numeric[]` 配合 `division_lines.cap` 一样的思路：这是**取值的证据**，
整体读整体写，从不单独查询某一天。建 `roster_entry_daily_utr` 表会为一个只被整体
消费的值增加一次 join 和一批行。

取样窗口的日期本身随赛季变（2025 是 09/22–09/26，2026 是 09/21–09/25），窗口定义
属于赛制而非名单，本次不建模，数组按 CSV 列序保存。

### D3. 评级类别是可空列，导入只填能确定的两种

`rating_class` 取值 `verified` / `committee` / `self_rated`，可为 NULL。
导入按 `DUTR Status` 的前缀词判定：`Rated` → `verified`，`Projected` → `committee`，
`Unrated` → NULL。`/ Appeal` 后缀不参与判定，但原始文本完整保留在 `dutr_status`。

`Unrated` 不猜的理由写在 spec 里：类别取决于有无 USTA 比赛历史，不在总表中。
2025 的 26 行 `Unrated` 中 25 行 `Notes` 有值，人工回填是一次过目而非调查 ——
前提是 `source_note` 原样保留。

考虑过用 `Notes` 自动推断（`Captain Provided` → self_rated、`Zijing Cup 20xx UTR`
→ committee）。否决：这套映射没有经组委会确认，而 `self_rated` 直接决定
「上场 ≤2 名且不得互相搭档」这条硬约束。猜错会放出非法阵容，且错误会被掩盖在
「已自动判定」的外观下。留 NULL 是可见的未完成，比看不见的错误好。

### D4. 导入沿用 load_rules 的四步，但多一份对账报告

`parse → read → compare → write`，`--check` 复用同一个比对函数（理由同
`competition-rules`：两套比对逻辑会产生「check 说一致、导入却写了东西」）。

新增的是 `ImportReport`：跳过的非名单行、无法解析的行、行数异常的球队，
以及可选排名表带来的两节对账。报告在两种模式下都产出 —— `--check` 也要能回答
「数据源现在还对不对得上」。

对账用的排名表是**可选的第二个 CSV 参数**，只读来比对，不落表。这让
Non-Goals 的「TPI 不入库」与 Success Criteria 的「报出有排名无名单」不矛盾。

### D5. 球队标识用总表里的 code，不试图解析联队成分

球队在总表里是 `ZJU-UCSD-UCB`、`SJTU-SJSU-ECU` 这类字符串。规则对联队学校数有限制
（最多三校，经批准可四校），拆解 code 能得到成分，但**总表的 code 不可靠**：
同一支队在不同 tab 里写法不一致（排名表有 `UCSD-ZJU-MU`、名单里没有）。

本次原样存 code，不拆、不规范化、不做别名归并。谁和谁是同一支队，是 `roster-display`
或人工要面对的问题，不该由一个解析规则在导入时替人决定。

### D6. 名单 CSV 的存放与忽略

约定放在 `backend/data/rosters/`（`.gitignore` 忽略整个目录，保留一个 `.gitkeep`
与 `README.md` 说明格式）。目录进仓库、内容不进。

导入命令接受显式路径参数，不硬编码目录 —— 操作者可以从任何位置导入，
默认路径只是省事。

## Risks / Trade-offs

- **导入了一份残缺名单而无人察觉**（银组 5 队没名单，排阵分析看起来正常但结论错）
  → 对账报告是本次的核心产物之一，不是附属品；spec 里为它写了独立的 requirement
  与 5 个 scenario。
- **`Unrated` 的类别长期空着**，`lineup-engine` 到时无法校验 self-rated 约束 →
  可见的 NULL 优于不可见的错误；人工回填量为 26 行且 25 行有依据。
- **快照模型将来要改成有球员实体** → `utr_profile_id` 已在条目上，届时可从该列
  长出实体而不必重导；代价是一次 migration，可接受。
- **同队重名会破坏唯一键** → 2025 全部 331 行已核对无同队重名；导入遇到时报错
  而非覆盖，这是快照语义唯一会被悄悄破坏的地方。
- **人工字段被重导抹掉**（外援标记、profile 关联、回填的评级类别）→ 见 D1b：
  比对与写入按字段归属划界；spec 为此写了独立 requirement 与 5 个 scenario，
  其中一条专门断言 `--check` 不把人工字段报成漂移。
- **真实个人数据误入仓库** → `.gitignore` + 新增一条 verification check 扫描；
  测试数据全部虚构姓名。
- **CSV 列名随年份变**（2025 是 `Verified DUTR 09/22`，2026 会变成 09/21）→
  解析按列位置与前缀匹配，不硬编码完整列名；无法识别的列进报告而非静默丢弃。

## Migration Plan

**部署顺序**：migration → 导入 CSV → 后端。前端本次无改动。

**Migration 内容**：新增
`supabase/migrations/<timestamp>_create_team_rosters.sql`，首行
`set search_path to zijing_cup, public;`，建 `teams` 与 `roster_entries` 两张表、
外键与唯一索引（`teams(season_year, division_code, code)`、
`roster_entries(team_id, last_name, first_name)`、
`roster_entries(team_id, utr_profile_id)` 部分唯一索引 where not null）。
`is_borrowed_player` 为可空布尔，无默认值。
`teams` 的 `(season_year, division_code)` 引用 `divisions(season_year, code)`。

**回滚**：本次全部新增。回滚 = 反向 migration `drop table roster_entries, teams`
（按外键反序）。不影响 `competition-rules` 的四张表，也不影响 `public` schema。
后端回滚到上一部署即可，既有端点不依赖本次任何表。

**远程应用**：按 CLAUDE.md，共享 Supabase 项目禁用 CLI `db push`，
migration 去 Dashboard SQL Editor 手动执行。

**数据安全**：名单表含真实个人数据。它只存在于数据库，CSV 不进仓库，
测试用虚构姓名。

## Open Questions

无阻塞问题。三条与名单相关的领域歧义（`Projected` 是否受 self-rated 约束、
`/ Appeal` 语义、外援无法识别）已记录在 `docs/domain/rules.md`「待澄清」，
影响的是 `lineup-engine` 怎么判而非本次怎么存。
