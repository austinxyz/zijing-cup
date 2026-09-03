---
Date: 2026-09-02
Change: lineup-saved-filters
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# lineup-saved-filters

排阵的锁定与排除现在**只活在 URL 里**（`{线}a`/`{线}b` 每条锁、重复的 `ex=`）。链接能
复现一次搜索，但要「留住」一套约束只能自己存链接。本次给队长一个**命名的、列在页面上的、
管理员维护的过滤预设（preset）**：把当前页面的锁定/排除存成一个有名字的 preset，之后一键
载入，不用再收藏链接。

这是三条阵容增强里的 B。诊断（A）已落地；保存阵容 + 失效标记（C）另列。

## 背景（探索阶段读到的事实）

- 锁定/排除**全部编码在 query string**：每条线两个位 `{code}a`/`{code}b`，排除是重复的
  `ex=<key>`。`page.tsx` 的 `constraintsFromQuery` 从 query 读出 `{locks, excluded}`，
  不进 React state——URL 是唯一记录。
- 锁定/排除引用的是**队专属的球员 key**（`p<id>`）。一个 preset 只对它所属的那支队有意义。
- **无 per-user 登录**，只有共享密钥 admin 中间件，按 **HTTP 方法**（`WRITE_METHODS`）判
  写权限，新写路由不声明就已受保护。CLAUDE.md 硬规则：不要往共享密钥模型上打 per-user 补丁。
- 已有写路径样板：`player-registry`（`app/players/command.py`、`routers/players.py`、
  `lib/admin.ts` 服务端单一出口、迁移建表）。前端 admin 流程走 server action（in-app 浏览器
  要 `requestSubmit()` 触发）。
- key 会 stale：`p<id>` 是这次改版才定的格式，旧裸整数链接已有专门的 stale-link 处理；
  但那条只认「旧格式」。preset 存的是当前格式、却可能指向**之后被移出名单**的球员——格式
  合法、引用不可解，是另一类失效。

## Goals

- **保存**：管理员在某队排阵页把**当前的锁定 + 排除**存成一个命名 preset。
- **列出**：该队排阵页列出它的所有 preset（任何人可读）。
- **载入**：一键把某个 preset 的锁定/排除**写回 URL 参数**，页面照常从 URL 重渲染——
  搜索路径一个字都不改，preset 只是同一批 query 参数的一个存储来源。
- **删除**：管理员删掉一个 preset。
- **失效即明说、拒载入（只针对锁定）**：载入时若 preset 的**锁定**引用了已不在当前名单上
  的球员，检测到就不静默应用，页面明说「这个 preset 锁定的某人已不在名单」，给删除/重建
  入口——沿用 stale-link 的「不拿一个看似健康的列表糊过去」纪律。**排除**引用的人离队则
  **不算失效**：排除一个已离队的人本来就是想要的效果（他本就上不了场），照常载入，那条
  已无意义的排除可静默丢掉（或带一句中性提示），不因此拒载。

## Non-Goals

- **不做保存阵容 / UTR 快照 / 合法性重判**——那是 C（`lineup-saved-lineups`）。B 只存
  **输入约束**（锁定 + 排除），不存搜索结果，不冻结任何 UTR。
- **不做 per-user 登录 / 归属 / 多租户**：preset 是 **admin-global**，同队所有读者看到同一批。
- **不改搜索算法、URL 编码、cap/buffer/资格规则、候选呈现、A 的无解诊断**。
- **不做 preset 的重命名/编辑**：管理只有存（create 或同名覆盖）与删两个写操作；改名 = 覆盖。
- **不做跨队/跨组别共享 preset**：key 是队专属的，跨队载入必然全 stale。

## Constraints

### 架构

- 新表建在 `zijing_cup` schema，新 migration（`supabase/migrations/*.sql`，以
  `set search_path to zijing_cup, public;` 开头或全限定名）。远程共享 Supabase **不跑 CLI
  push**，去 Dashboard SQL Editor 手动执行；本地直接把 SQL 打到本地栈（执行前断言连接串含
  `127.0.0.1`）。
- preset 存**输入约束本身**（locks + excluded），最自然的形状是一列 JSONB（就是那批 query
  参数），不必把每条锁拆成行——具体列形状 design 定。
- 后端经 `app/lineups/`（读）与一套新的写命令（存/删）暴露；前端经 `lib/api.ts`（读）
  与 `lib/admin.ts`（写，server-only 单一出口）取数，浏览器不碰后端地址/密钥。
- 写路由**靠 HTTP 方法自动受保护**，MUST NOT 改成靠 `/api/...` 路由前缀判 admin，也
  MUST NOT 改用「忘挂就敞开」的 FastAPI 依赖式鉴权。

### 真实性 / 安全

- 载入 preset = 把它的 locks/excluded 变成 query 参数后走**与手填 URL 完全相同**的后端校验
  （未知 key → 4xx、旧格式 key → stale-link）。preset MUST NOT 能注入任何一条裸 URL 注入
  不了的东西——它不是新的信任入口，只是同一批参数的存储。
- 载入时的**新失效检查**：只有**锁定**引用的 key 必须在当前 `search.roster` 里解析得到；
  一条锁的任一位解析不出就判 preset 失效，明说 + 拒载入，MUST NOT 丢掉失效锁后把剩下的
  静默应用。**排除**引用的 key 解析不出**不判失效**（排除已离队者是无操作），照常载入，
  MAY 带中性提示说某条排除已无意义。
- 名字是 admin 手填文本，按普通用户输入对待（前端转义，不拼进 SQL——参数化）。

### 呈现

- 保存/预设列表/载入/失效面板沿用既有样式档，显式给底色，对比度 ≥ 4.5:1（实测 computed
  style），窄视口（<768，收进排阵抽屉）与桌面都读得清、不横向溢出。
- 空约束（什么都没锁/排）时的保存入口：至少要有一条约束才能存（存一个空 preset 无意义）。

### 测试

- 后端 pytest：存/取/删 preset、同名覆盖、失效检查（引用已移除球员）、写路由无 admin 凭据
  被拒（沿用 `test_admin_auth.py` 的全应用范围断言）。
- 前端 vitest + `npx tsc --noEmit` 单列（vitest 不校验类型）。
- 本地看页面前不跑 pytest（会清库）；顺序：先测试 → 补种 → 视觉核对。写路由需管理员登录，
  in-app 浏览器走 `requestSubmit()` 触发 server action。

## Success Criteria

1. 管理员在某队排阵页存下当前锁定/排除为一个命名 preset；该队排阵页随后列出它。
2. 任何人（不登录）可见 preset 列表并一键载入；载入后 URL 带上对应 locks/excluded，页面
   从 URL 重渲染出同一套约束，搜索结果与手填这批参数一致。
3. 同队内 preset 名唯一；同名保存覆盖旧的。管理员可删除。
4. 载入一个**锁定**引用了已移除球员的 preset 时，页面明说该 preset 失效并拒绝静默应用，给
   删除/重建入口；不呈现一个看似健康的候选列表。若只是**排除**引用了已移除球员，照常载入
   （那条排除已无意义，可静默丢或带中性提示）。
5. 无 admin 凭据的存/删请求被拒（写路由靠方法判权，不靠前缀）。
6. 桌面与 375 都读得清、0 对比度不合格、无横向溢出。
7. `npx tsc --noEmit` 干净；vitest 与 pytest 全绿。

## User Stories

- 作为队长，我常用几套固定阵型（主力、缺某主力的备案、打某对手的针对阵），想给它们各起个
  名字存下来，下次直接点开，而不是每次重新勾一遍或翻聊天记录找链接。
- 作为队长，我把一套存了名的阵型发给队友，他不用管链接，在页面上就看得到这套 preset 并载入。
- 作为队长，如果某个 preset 里的人已经退赛/不在名单了，我要它直接告诉我这个 preset 过期了，
  而不是默默少排一个人给我一份看着正常的阵容。

## Open Questions

1. preset 存储列形状：一列 JSONB（`{locks:{线:[keyA,keyB]}, excluded:[key]}`）还是拆成
   规范化的子行？—— design 定（倾向 JSONB，它就是那批 query 参数）。
2. 失效检查放在哪层：前端拿 `search.roster` 比对（已有数据、零额外请求）还是后端载入时校验
   并回结构化失效原因？—— design 定（倾向前端比对为主，因为 roster 已在手）。
3. preset 每队数量上限 / 名字长度上限。—— design 敲定，防滥用。
4. 载入的交互：是生成一个链接让用户点（保持 URL 是唯一记录、可分享），还是一个按钮直接
   `router` 导航？两者最终都落到 URL。—— Phase 4 视觉稿定。
5. 保存/列表/载入/失效面板在排阵页与窄视口抽屉里的排布。—— Phase 4 视觉稿。

## Referenced Capabilities

- `lineup-ui` —— 本次主要改的能力（保存/列表/载入/失效呈现，读写经既有出口）。
- 可能新增一个 capability（如 `lineup-filter-presets`）承载「preset 的存取契约」，或并入
  `lineup-ui`。—— propose 阶段按 delta 归属定。
