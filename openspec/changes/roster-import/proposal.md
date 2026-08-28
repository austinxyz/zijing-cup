---
Date: 2026-08-28
Change: roster-import
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-08-28-roster-import-requirements.md
---

## Why

`competition-rules` 已经把规则侧建好了 —— 各线 cap、buffer、分值、资格阈值都按
`(赛季, 组别)` 存为数据。但被这些规则约束的对象还不存在：系统里没有球队、没有球员、
没有参赛 UTR。规则页能告诉你「D1 上限 13.00」，却答不出「我队谁和谁配 D1 能压在
13.00 以内」。

`roster-display` 与 `lineup-engine` 都以此为前置，先做这一层。

数据来源是 2025 年组委会的 UTR 总表。这张表**不能直接导** —— 它有伪队名（合并单元格
的脚注漏成数据行）、有只含一名球员的伪球队（实为排名表备注对应的被排除球员）、
球队清单在各 tab 之间对不上（银组 5 队有排名无名单、2 队有名单无排名），
且没有 UTR profile ID。导入器的价值一半在解析，一半在**说出它对不上的地方**。

## What Changes

- 新增球队与名单的数据模型（建在 `zijing_cup` schema），按 `(赛季, 组别)` 组织：
  球队；名单条目含姓/名、性别、参赛 UTR、原始 `DUTR Status`、可空的规则评级类别、
  来源依据原文、取样窗口的五个每日 UTR 值、可选的 UTR profile ID。
- 新增 CLI 导入命令，读取从总表导出的 CSV，幂等写入，提供 `--check` 漂移检测 ——
  与 `load_rules` 同一形状。**CSV 不进仓库**（真实个人数据）。
- 导入产出对账报告：跳过的非名单行、无法解析的行、行数异常的球队，
  以及（提供可选的排名表 CSV 时）有排名无名单与有名单无排名的球队。
- 评级类别在可判定时自动判定（`Rated` → 已认证、`Projected` → 委员会审定），
  `Unrated` 留空待人工，不猜。
- 新增只读端点：`GET /api/seasons/{year}/divisions/{code}/teams` 与
  `GET /api/seasons/{year}/divisions/{code}/teams/{team}/roster`。
- 新增一条 verification check：扫描仓库确保未混入真实球员数据。

不含破坏性变更：全部是新增。`competition-rules` 的表、端点与 seed 流程不变。

## Capabilities

### New Capabilities

- `team-roster` —— 球队与球员名单的 `(赛季, 组别)` 模型、CSV 导入命令与对账报告、
  参赛 UTR 及其来源依据与评级类别、UTR profile 关联、名单只读查询端点。

### Modified Capabilities

无。`competition-rules` 与 `app-shell` 均不改动。名单表通过 `(季, 组)` 与规则表
指向同一对赛季/组别，但不修改后者的任何 requirement。

## Impact

- `supabase/migrations/` —— 新增一个 migration，建球队表与名单条目表；
  schema-qualified DDL，首行 `set search_path to zijing_cup, public;`。
- `backend/app/models/` —— 新增球队与名单条目的 SQLModel 定义。
- `backend/app/rosters/` —— 新增 CSV 解析、比对、写入与对账报告。
- `backend/app/rosters.py` 或同层 —— 名单查询的组装逻辑。
- `backend/app/routers/` —— 新增只读路由并在 `main.py` 注册。
- `backend/tests/` —— 导入幂等性、`--check`、伪队名与异常行识别、
  评级类别三分支、端点 200/404。测试数据全部虚构姓名。
- `openspec/config.yaml` —— 新增真实球员数据扫描的 verification check。
- `.gitignore` —— 忽略名单 CSV 的存放位置。
- 依赖：不新增运行时依赖（CSV 用标准库 `csv`）。

## Out of Scope

- 前端任何页面。浏览球队与球员留给 `roster-display`。
- 阵容合法性校验与阵容搜索 —— 留给 `lineup-engine`。本次只存，不判。
- UTR 的自动抓取或定时同步。
- 赛后 UTR 变化（总表的 After Event 两个 tab）。
- 外援名额校验 —— 总表无法识别外援，属能力缺口，见 `docs/domain/rules.md`「待澄清」第 4 条。
- 球队 TPI 与种子排位入库（排名表仅作对账的可选输入，不落表）。
- 跨赛季球员身份的自动归并；同名不做任何自动合并。
- 名单的 HTTP 写入端点与编辑界面。
