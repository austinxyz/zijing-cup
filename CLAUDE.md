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
- 上面那条TRUNCATE还有个本地的连带后果：跑完`pytest`本地库就空了，此时任何名单导入会以`no division 'silver' in season 2025`失败，前端页面则全是404，读起来像路由坏了。跑`bash backend/scripts/reseed-local.sh`一次补回三份seed（规则→名单→球队中文名，有依赖顺序），该脚本拒绝对非本地库运行。
- **Google Sheets导出的CSV表头不在第1行。** 前面有一个空行、两行合并单元格脚注、再一个空行，列名在第5行；第1行是`,,,,,,,,,,,,,`。任何"读第1行判断这是不是名单文件"的逻辑都会静默失败：解析器会把整份文件判成不可读（看起来像空名单，不像读错了），而按内容识别的安全扫描会对一份真实名单报clean。解析和扫描都要在前若干行内找表头（`parse.py`的`HEADER_SEARCH_LIMIT`=20，`config.yaml`的真实数据扫描用`head -20`）。
- **别拿抓取来的表格markdown当事实源。** Drive/网页抓取会静默截断：一次银组名单只回了11支队，据此写进requirements的"13队211人"、"5支球队有排名却没名单"、"`SJTU`只有1行"三条全是假的（实际18队339人，那5支队各有17-26人）。真实导出一跑就全推翻了。凡是要写进验收标准的数量，用真实导出文件核对过再写。
- **本机跑不了`supabase` CLI**：`supabase db reset`/`db push`都以`EUNKNOWN: uv_spawn`失败，Bash和PowerShell都一样，跟上面uvicorn.exe那条是同一类Application Control拦截。本地要应用新migration，就直接把该文件的SQL打到本地栈（执行前断言连接串含`127.0.0.1`）。migration文件仍是唯一来源，谁将来跑`db reset`都会照常重放，所以不产生漂移——代价只是本地`supabase_migrations`表里没有记录，与远程手工执行是同一种代价。
- **别在会`notFound()`的路由下放`loading.tsx`。** 路由级Suspense边界让Next在页面代码跑之前就flush响应头，于是`notFound()`再也设不了状态码——实测同一个未知球队，有它返回200、去掉返回404。同一批实测里fallback还始终没被替换（生产构建也一样），名单挂在隐藏容器里、页面停在加载文案。冷启动的加载反馈要做的话，得找别的做法。
- **`h-screen overflow-hidden`的壳里，任何可能变长的列表都必须自带滚动容器**，否则超出部分被静默裁掉且**不出现滚动条**，看不出还有内容。滚动要放在内层：加在整列/整个main上会把列头和标题一起卷走（表头加`flex-none`并不能钉住它——滚动在共同祖先上时它照样跟着走）。这个缺陷五轮评审加视觉对照都没抓到，因为对照是在「刚好放得下」的视口下做的；是交付后在真实窗口里翻到底部才发现的。视觉核对要挑最长的数据（2025最大名单26人）并把窗口调矮。

- **每条新路由都要自带`error.tsx`，否则取数失败会把侧栏一起清空。** 根`app/error.tsx`替换的是整个窗口；路由自己没有边界时，一次冷启动超时就从「某一块加载失败」变成「整个应用崩了」。`rules/`与`teams/[code]/`早就各有一个，新加的`lineup/`两条路由当初漏了，是评审卡住才发现的——加壳那条规则（壳放layout）只保证壳不在页面里，不保证下面每条路由都有自己的错误态。实测方法：把`BACKEND_URL`指到一个没人监听的端口，看侧栏还在不在。
- **深色侧栏里不要用内容区的颜色token。** 赛季切换器的药丸底色写成`bg-background`——那是浅色页面底色`#f6f4f0`，配上近白标签`#f2eee7`只有**1.05:1**，当前赛季基本看不见，是用户截图报上来的。侧栏是有自己配色的页面外壳：要一块凹底就新加`--color-sidebar-well`(#14130f，视觉稿本来的值)，别从内容区借。改后16.07:1。核对对比度要读computed style算，别照着源码估。
- **一个页面里两次后端整解要并发跑。** 排阵页在有锁定时会额外跑一次无约束搜索来算「锁定的代价」；串行`await`两次，在冷启动的Render免费实例上会叠加到接近函数超时。两者互不依赖，用`Promise.all`。
- **`npm run lint`当前跑不起来**：ESLint以`Converting circular structure to JSON`在加载配置时就崩了，一行代码都没检查。它不在`config.yaml`的`test_commands`里，所以CI也不会因此变红——别把它的沉默当成「lint干净」。要么修配置，要么明确知道这条防线现在是空的。
- **队员注册表也吃 TRUNCATE 那条**，而且是**级联**吃到的：`pytest` 清 `seasons` 与 `teams`，`player_season_utrs`(→seasons) 与 `player_team_memberships`(→teams) 的外键是 `on delete cascade`，于是跟着一起没。`players` 行本身留着，变成一堆没有任何赛季记录的孤儿——症状是列表页还有几百人，但「未裁决」显示 0、`migrate --check` 报 `would create 0`（因为 `roster_entries` 也空了，它读不到源）。恢复顺序：先补种（规则→名单→队名），再把 `players` 清空，最后重跑 `python -m app.players.migrate`。只重跑迁移不会修好孤儿，因为迁移按姓名匹配到了它们、判定为「已存在」。
- **本机 `uv run` 现在连 venv 里的 python 都拦**（`os error 4551`，`uv run pytest` 报 `uv trampoline failed to spawn`）。这跟之前 uvicorn.exe 那条是同一类 Application Control 拦截，只是范围扩大了：uv 造的 venv/trampoline 是未签名的用户目录可执行文件。绕法是用**系统 python 自己建的 venv**——`python -m venv backend/.venv-std` 再 `./.venv-std/Scripts/python.exe -m pip install ...`，那份 python.exe 是签名解释器的副本，能跑。此后所有后端命令都走 `backend/.venv-std/Scripts/python.exe -m ...`（pytest、uvicorn、seed、migrate 都可以）。`.venv-std/` 已在 .gitignore 里；`pyproject.toml` 与 CI 仍以 uv 为准，这只是本机的绕行。
- **写接口的鉴权按 HTTP 方法判，不按路由前缀。** `app/auth.py` 的中间件里第二层检查的是 `request.method in WRITE_METHODS`，因此新加的写路由不声明任何东西就已经被保护。别改成「`/api/admin` 前缀下才要求管理员」——前缀靠人记得，方法是请求自带的属性。同理别改用 FastAPI 依赖：依赖是加法式的，忘挂就是敞开。三处旧的「OpenAPI 里不存在写方法」断言已经改写成「每条写路由都拒绝没有管理员凭据的请求」，`test_admin_auth.py` 里那条是全应用范围的，改中间件时它会红。
- **`npm run test` 不做类型检查。** vitest 走 esbuild，只转译不校验类型；`next build` 才会跑 `tsc`。往 `lib/api.ts` 的接口加一个必填字段、忘了更新几个测试 fixture，测试会全绿而生产构建红。`openspec/config.yaml` 里已经把 `npx tsc --noEmit` 单列成一条验证项——别只看 vitest 的绿。
- **NOT NULL + 数据库默认值的列，SQLModel 会发显式 NULL。** `locked_at: Optional[datetime] = None` 对着 `timestamptz not null default now()`，插入时抛 `NotNullViolation` —— 属性被设成了 None，SQLAlchemy 就当成「要写 NULL」，而不是「不写这一列」。要让数据库自己盖值，得在模型里写出 `sa_column=Column(..., server_default=func.now(), nullable=False)`；这也顺带保证时间戳只有一个时钟。锁赛季那条一开始就是这么坏的，单测没覆盖到就只在真跑的时候炸。
- **`x-forwarded-for` 的第一段是调用方写的，不能拿来当限速的 key。** 轮换一下就是一个新桶，锁定永远不触发。要用平台自己设的头（`x-real-ip` / `x-vercel-forwarded-for`）或 XFF 的**最后**一段；更要紧的是另配一个 header 影响不到的**全局配额**，那才是让轮换失去意义的东西。同一类错误的一般形式：**任何来自请求头的东西都不能单独用来限制这个请求**。
- **不要从数值本身推断它的来源。** 未裁决的两个参赛 UTR 曾按「较大的是银组」布列，而 2025 的真实数据里较大值时而在金组（Chen Yilun 6.98）时而在银组（Zong Qingqing 6.38）—— 那一列对一半的行说了反话，偏偏裁决就是靠它判断该信哪份表。来源要跟着值一起存（`value_division`/`alt_value_division`），存不到就显示「来源未知」：**错的标签比没有标签更糟**，看的人分辨不出来。
- **小数不能按字符串比。** 库里是 `Decimal("7.00")`，人手填 `7`，`str()` 出来一个 `"7.00"` 一个 `"7"` —— 于是差异屏摆出一屏没人做过的改动，而「原样往返 0 处改动」那条地基当场塌掉。导出再导回不会触发（导出写的就是 `7.00`），**手填才会**，而手填正是那张表的全部用途。项目本来就有「`Decimal` 全程」这条约束，这次仍然在比较那一步漏了。
- **调长超时不能修一条一直不通过的测试。** `waitFor` 会一直轮询到断言成立，所以窗口从 1s 调到 5s 只是把「断言超时」换成「整条测试超时」，问题一点没动。我据此误判过一次，把它当成 flaky。正确做法是**等一个渲染出来的结果**（比如界面回到了某个状态）而不是等间谍函数 —— 前者有确定的完成信号，后者是在跟 React 的调度赛跑。
- **给一次操作附带的第二个写入找一个明确的护栏，并把代价写进 design。** 「赛季未锁时，写当前双打 UTR 同时覆盖该赛季的参赛 UTR」是负责人拍板的，覆盖不论原来源；护栏只有赛季锁（组委会数据一导入就立刻锁季，所以两者流程上不重叠）。代价是：忘了锁，一次手填就会无声覆盖组委会的冻结值，页面上看不出发生过覆盖。这类「A 顺带改 B」的设计本身没问题，但**护栏是什么、失守时会怎样**必须写下来，否则将来没人答得上「为什么没有第二道保护」。
- **新做的面板要显式给 `bg-surface`，别靠继承页面底色。** `--color-muted` 在白底上 4.69:1、在页面底色 `#f6f4f0` 上 **4.27:1** —— 差 0.42，正好卡在 4.5 两侧。也就是这个 token 够不够看**取决于容器有没有给自己底色**，而这件事在源码里看不出来。当前 UTR 那块面板忘了给，于是一屏 28 个叶子节点低于 4.5，改回来后 0 个。核对方式是量 computed style，不是照源码估。
- **补种之后、视觉核对之前，绝对不要再跑 `pytest`。** 这条上个 change 就写过，本次仍然踩了三次：补种 → 迁移 → 造演示数据 → 顺手跑一遍全套测试，本地库就又空了，页面 500「no seasons are loaded」。顺序**写死**：先跑测试 → 再补种 → 再做视觉核对，中间不插测试。补种脚本只重建名单里有的东西，**手工造的队/组别它不认**，要自己删。
- **`uvicorn --reload` 的父进程不换代码。** 改完后端刷页面看到的仍是旧响应，本次因此两次下错结论（以为字段没传出来、以为逐人来源是 null）。判断依据要 `curl` 那个接口；确认改动生效最稳的办法是杀掉整个 python 进程再起，别只依赖 reload。
- **换数据源放宽了某个 NOT NULL 不变式时，先问「读的那一侧拿什么表示『没有』」。** 旧的 `roster_entries.match_utr` 是 NOT NULL，「在队」蕴含「有参赛 UTR」；新注册表允许两者脱钩，而响应模型里 `match_utr` 仍是必填 `Decimal`，于是那名队员被 `continue` 掉了。后果不是少一行，而是**两个端点互相矛盾**：球队列把他算进 `player_count`，名单不返回他，页面上没有任何迹象说少了人。评审拦下来时代码里的注释正好写着「丢掉会误报阵容」。这一条同时说明：把「没有值」表达成 0 或哨兵同样不行（0 是一个合法 UTR），要么字段可空，要么显式说取不到。
- **本地看页面之前别再跑 `pytest`。** 上面那条 TRUNCATE 不只是「跑完要补种」，它和 VISUAL DIFF 的顺序有关：补种 → 迁移 → 造演示数据 → 跑一次全套测试，本地库就又空了，页面变 404，而你已经准备好去核对视觉了。本次为此重来了两遍。顺序固定为**先跑测试，再补种，再做视觉核对**，中途不要插测试。
- **本地 uvicorn 不带 `--reload` 就是在看旧代码。** 改完后端接口去刷页面，看到的字段仍是旧形状——本次据此两次误判（一次以为 `singles_utr` 没传出来，一次以为逐人 `origin` 是 null，实际都只是进程没重启）。要么起服务时加 `--reload`，要么改完后端就重启；判断依据是直接 `curl` 一下那个接口，别只看页面。
- **「字段存在」不是断言。** `assert "origin" in player` 对一个值为 `null` 的字段照样通过，而 `null` 在前端被 `origin !== "frozen"` 读成「是估算」，于是十个人全被标成估算。断言要落到取值集合上（`in {"frozen", ...}`）。同理，响应模型里给这类字段一个「看起来合理」的默认值（当时是 `= UtrOrigin.FROZEN`）会把 bug 变成一个错误的标签；改成必填、查不到就 KeyError，坏掉的时候才会在坏的地方响。
- **评审 subagent 返回 PASS 不等于评审结束。** 它内部调的 code-review 子代理可能在评审已经打完分之后才把结果报上来 —— group 5 与 group 8 各出现一次，两次都带着真实的 HIGH（合并的赛季锁范围过宽、`tsc` 7 个错 + 合并后来源标签变陈旧）。收到 PASS 之后如果还有后台任务没回，别急着当这一组已经清零；那份迟到的报告要照读。**还有一种是同一次评审内部自相矛盾**：current-utr-source 的 group 4 在正文里列了 3 个 HIGH，按协议应当直接 BLOCK 不打分，它却照样算出 92 分返回 PASS。所以别只看 `status:` 那一行 —— 读 findings，有 HIGH 就当 BLOCK 处理。
