## Context

排阵的锁定/排除全部编码在 URL query（`{code}a`/`{code}b`、重复 `ex=`），`page.tsx` 的
`constraintsFromQuery` 从 query 读出 `{locks, excluded}`，不进 React state。搜索经
`getTeamLineups`（`lib/api.ts` 单一出口）→ FastAPI `GET .../lineups`。写路径样板见
player-registry：`lib/admin.ts` 服务端单一出口 + server action、`command.py`、路由、迁移。
admin 中间件按 **HTTP 方法** 判权（`app/auth.py` 的 `WRITE_METHODS`），新写路由不声明即受保护。
`teams` 表 PK `id`、`unique (season_year, division_code, code)`。

## Goals / Non-Goals

**Goals:**
- 命名的输入约束（locks + excluded）按队存、列、载、删；admin-global。
- 载入把约束写回 URL，搜索路径不变。
- 锁定失效拒载 + 明说；排除失效照常载入。

**Non-Goals:**
- 保存阵容 / UTR 快照 / 合法性重判（C）。per-user / 归属 / 多租户。重命名/编辑、跨队共享。
- 改搜索算法、URL 编码、A 诊断。

## Decisions

### D1 — 单表 + 一列 JSONB

新表 `zijing_cup.lineup_filter_presets`：

```sql
set search_path to zijing_cup, public;

create table lineup_filter_presets (
    id          bigint generated always as identity primary key,
    team_id     bigint not null references teams (id) on delete cascade,
    name        text   not null check (char_length(name) between 1 and 60),
    -- 输入约束本身，与 URL 那批参数同形：{"locks": {"D1": ["p12","p34"], ...},
    -- "excluded": ["p56", ...]}。就是一批 query 参数，拆成子行是过度设计。
    constraints jsonb  not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (team_id, name)
);
```

`team_id` FK `on delete cascade` —— 队没了 preset 跟着没，归属天然锁到 (赛季,组别,队)。
`unique (team_id, name)` 落实队内名唯一。**同名覆盖**用 upsert：`insert ... on conflict
(team_id, name) do update set constraints = excluded.constraints, updated_at = now()`。

**为什么不拆规范化子行**：preset 就是那批 query 参数，读出来整体塞回 URL，从不按单条锁查询；
JSONB 一列读写一次到位。

**远程应用**：Dashboard SQL Editor 手动执行（CLAUDE.md no-CLI-push）；本地直接打到本地栈
（执行前断言连接串含 `127.0.0.1`）。

### D2 — 失效检查放前端，比对 `search.roster`

排阵页已经拿到 `search.roster`（所有当前有效 key）。载入某 preset 时，前端比对它的**锁定** key
是否都在 roster 里：任一位不在 → 判失效，出拒载面板。**排除** key 不在 → 不判失效，那条排除
静默丢（或中性提示）。零额外请求。

后端仍是第二道防线：载入 = URL 带 query 参数触发搜索，未知 key 走既有 4xx、旧格式走 stale-link
——preset 不是新信任入口。友好的「锁定的某人已离队」面板是前端的事（它有 roster 与名字）。

**为什么不放后端**：roster 已在手，前端比对省一次往返，且失效面板要显示球员名与哪条锁，
这些前端都有；后端只需保证不接受非法输入，已经做到。

### D3 — 载入 = 链接导航（保持 URL 唯一记录）

「载入」是一个把 preset 的 locks/excluded 编码成 query 的**链接/导航**（落到与手填同形的
URL），页面服务端从 searchParams 重渲染。保持 URL 是唯一记录、可分享，与既有「不进 React
state」的地基一致。失效的锁定不生成可用链接，改出拒载面板。

存/删是写操作，走 `lib/admin.ts` 的 server action（in-app 浏览器要 `requestSubmit()` 触发）。

### D4 — 上限

name ≤ 60 字符（DB check + 前端）；每队 preset ≤ 50 条（存时超限拒绝，防滥用）。

### D5 — 归属与鉴权

存/删是 POST/DELETE，自动落进 `WRITE_METHODS` 保护，无凭据被拒；列出是 GET，开放。
**不**加 `/api/admin` 前缀判权、**不**用依赖式鉴权（忘挂即敞开）。`test_admin_auth.py` 的
全应用范围断言「每条写路由拒无凭据」会覆盖新路由。

## Risks / Trade-offs

- [SQLModel NOT NULL + DB default 发显式 NULL] `created_at`/`updated_at` 对着 `not null
  default now()`，模型里若写 `Optional[datetime] = None` 会插 NULL 抛错 → 用
  `sa_column=Column(..., server_default=func.now(), nullable=False)`，让 DB 盖值、时钟唯一。
- [名字是用户输入] 参数化入库（SQLModel/SQLAlchemy 默认参数化），前端渲染转义；DB check
  限长；不拼字符串。
- [preset 与真实 roster 漂移] 存的是 key 快照，roster 会变 → D2 载入时比对 roster，锁定失效
  拒载。这是既定代价，不是 bug。

## Migration Plan

新增一张表，无破坏性变更。本地把 SQL 打到本地栈；远程 Dashboard 手动执行（远程
`supabase_migrations` 不留记录，是 no-CLI-push 的既定代价）。回滚 = `drop table
lineup_filter_presets`，其它一切原样。前后端部署顺序：后端先（表 + 端点），前端随后。

## Open Questions

（探索阶段 4 条已解决：D1 JSONB 列形、D2 前端比对 roster、D4 上限、D3 链接导航。无遗留。）
