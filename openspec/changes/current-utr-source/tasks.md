## 1. 表格解析与差异计算（纯函数）

### Contract
- **Spec**: 导出与导入 SHALL 使用同一套列，且原样导出、原样导回时 SHALL 产生 0 处改动。导入 SHALL 用每行的 `id` 定位队员，MUST NOT 用姓名匹配，也 MUST NOT 在 `id` 缺失或不认识时回退到姓名。姓名同行带回，仅用于校验。空白 = 不改；清空要显式写记号（`-`）；值与状态必须成对，只给一个的行 SHALL 被判为错误。状态列 SHALL 只接受 `unrated` / `projected` / `rated`，比对大小写不敏感，其他值 SHALL 判为错误，MUST NOT 猜测或映射。`UTR链接` 列 SHALL 同时接受完整链接与纯数字 ID，无法取出 ID 时 SHALL 判为错误而非存下原文。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_sheet.py -q` → expected: 全部通过；测试不触碰数据库
- **Code**:
  - D6：`backend/app/players/utr_sheet.py`，纯函数，签名不带 `Session`。TSV 与 CSV 在解析入口归一成同一种行结构，之后共用一条路径。
  - D2：`id` 缺失或不认识时 **MUST NOT** 回退到姓名匹配 —— 那等于在最需要保证的一刻把 D1 撤掉。这条要有专门的测试。
  - D3：三种「空」各自有测试；只有值没状态、只有状态没值都要报错。
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — 新建 `backend/tests/test_utr_sheet.py`：解析一段 TSV，断言得到逐行的 `SheetRow`（id、姓、名、五个可选值）；此时 `app.players.utr_sheet` 不存在，失败于 ImportError
- [x] 1.2 GREEN — 建 `backend/app/players/utr_sheet.py`，实现 TSV 解析与 `SheetRow`
- [x] 1.3 RED — 同一份内容以 CSV 提交时得到完全相同的 `SheetRow` 列表
- [x] 1.4 GREEN — CSV 入口归一到同一条路径
- [x] 1.5 RED — 比对：把导出行原样当作导入行时，差异为 0 处改动
- [x] 1.6 GREEN — 实现 `diff_rows(rows, players)`，返回逐字段的旧值/新值
- [x] 1.7 RED — 三种「空」：空白不改动；`-` 清空且算作一处改动；只有值没状态、只有状态没值都产生错误且错误指明缺哪个
- [x] 1.8 GREEN — 实现空值语义
- [x] 1.9 RED — 状态词：`Rated` 被接受；`已认证` 与 `verified` 都产生错误且错误列出可接受的三个词
- [x] 1.10 GREEN — 大小写不敏感的词表校验
- [x] 1.11 RED — 身份：id 不存在 → 错误；id 存在但姓名对不上 → 错误且指出库里是谁、表里写的是谁；**id 为空而姓名唯一匹配库中一人 → 仍然是错误，不落到那个人身上**
- [x] 1.12 GREEN — 实现按 id 定位与姓名校验位，无姓名兜底
- [x] 1.13 RED — `UTR链接`：纯数字与完整链接都归一成同一个 `utr_profile_id`；取不出 ID 的内容产生错误
- [x] 1.14 GREEN — 实现链接归一
- [x] 1.15 RED — 汇总：差异结果含按字段的改动计数、覆盖人数与未包含人数
- [x] 1.16 GREEN — 实现汇总
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 两个端点：按队取导出行、按 id 批量写

### Contract
- **Spec**: 后端 SHALL 提供一个只读端点，按 `(赛季, 组别, 球队)` 返回该队每名队员的 id、姓名与五个当前值；顺序 SHALL 与名单页一致。后端 SHALL 提供一个写端点，接受若干 `(id, 要改的字段)` 并在一个事务里写入，任一条失败时 SHALL 整批回滚。该端点 SHALL 只接受这五个字段，MUST NOT 借此改动姓名、性别或任何赛季数据。赛季锁 SHALL NOT 阻止这里的写入。当前 UTR SHALL 存在 `players` 上，一名队员只有一份。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_api.py -q` → expected: 全部通过
- **Code**:
  - D8：一条失败整批回滚；端点只认这五个字段 —— 能顺带改姓名的「UTR 导入」会让 D2 的姓名校验位失去意义。
  - 写路由由 `app/auth.py` 中间件按 HTTP 方法保护，不需要也不应该改成前缀判定或 FastAPI 依赖。
  - 导出次序与名单页一致（参赛 UTR 降序，同值按姓）——两处不一致会让人以为导错了队。
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — 新建 `backend/tests/test_utr_api.py`：GET 某队的导出行，断言每行含 id、姓名与五个字段
- [x] 2.2 GREEN — 在 `app/routers/players.py` 加只读端点
- [x] 2.3 RED — 导出次序与 `/roster` 端点返回的次序一致
- [x] 2.4 GREEN — 复用同一套排序
- [x] 2.5 RED — 批量写：提交若干改动后读回是新值；批次里含一个不存在的 id 时整批不写
- [x] 2.6 GREEN — 实现批量写与事务回滚
- [x] 2.7 RED — 请求体夹带 `last_name` / `gender` 时这些字段不被改动
- [x] 2.8 GREEN — 只取白名单里的五个字段
- [x] 2.9 RED — 赛季已锁时对该赛季某队的队员写当前 UTR，照常成功
- [x] 2.10 GREEN — 确认写路径不经过 `_assert_season_open`
- [x] 2.11 RED — 只带共享密钥、不带管理员凭据地调用写端点返回 403
- [x] 2.12 GREEN — 若未通过则修正（中间件应已覆盖，本条是防它被绕开）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 跨组别点名与整批拒绝

### Contract
- **Spec**: 差异结果 SHALL 含本批中同时属于其他组别名单的队员。存在任何一条错误时，系统 SHALL 拒绝落库整批，MUST NOT 只写没有错误的那部分。差异结果 SHALL 含本表覆盖的人数以及该队未被本表包含的人数。经任一支球队的表改动后，该队员在所有赛季、所有组别页面上呈现的都是同一个值。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_api.py tests/test_utr_sheet.py -q` → expected: 全部通过
- **Code**:
  - D4：整批拒绝而不是「写好的那部分」—— 最常见的严重错误是整列粘错位，那时几乎每行都会出错；放行一半会让库里一半新一半旧，且没有记录说明哪一半是新的。
  - 跨组别查询要一次查完，不要每人一查。
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — 一份含 1 条错误与若干改动的内容提交后，库中一处也没被改
- [ ] 3.2 GREEN — 有错误即拒绝整批
- [ ] 3.3 RED — 一名同时在金银两组的队员：经银组的表改动后，金组读到的是同一个新值；差异结果点名了他
- [ ] 3.4 GREEN — 实现跨组别检测（一次查询）
- [ ] 3.5 RED — 只含该队一部分人的内容：其余人不变，且结果报出覆盖 N 人、未包含 M 人
- [ ] 3.6 GREEN — 实现覆盖/未包含统计
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 导出与导入两页签

### Contract
- **Spec**: `/[season]/[division]/teams/[code]/utr` SHALL 以两个页签承载导出与导入。导出页签呈现整张表（可整块复制）并提供下载 CSV；前三列 SHALL 在视觉上标明「不要修改」。导入页签同时提供粘贴框与文件上传两个入口，二者 SHALL 走同一套解析。提交按钮的文案 SHALL 表明它产生的是差异而不是写入。该路由 SHALL 自带登录门与 `error.tsx`。
- **Runtime**: `cd frontend && npm run test -- utr` → expected: 全部通过；随后 `npx tsc --noEmit` 无错误
- **Code**:
  - D7：`players/layout.tsx` 的登录门覆盖不到 `teams/` 下的路由，要照着再配一份；`error.tsx` 不能省 —— 路由没有自己的错误边界时，一次冷启动超时会从「某一块加载失败」变成「整个应用崩了」。
  - 两个入口必须走同一套解析：给出不同结果会让人无从判断该信哪个。
  - `lib/api.ts` 仍是读取的单一出口；写经 Server Action → `lib/admin.ts`。
  - 改完跑 `npx tsc --noEmit`：vitest 只转译不校验类型。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 MOCK — open docs/superpowers/specs/mocks/2026-08-31-current-utr-source-mocks.html 的「导出 / 导入」两节；抄下列名、灰底三列的处理、按钮文案（`看差异`）与色档
- [ ] 4.2 RED — vitest：导出页签渲染八列表头，前三列带「不要修改」的样式标记；底部有「复制整张表」与「下载 CSV」
- [ ] 4.3 GREEN — 实现导出页签
- [ ] 4.4 RED — 导入页签同时有粘贴框与上传入口；同一份内容经两个入口得到相同的解析结果
- [ ] 4.5 GREEN — 实现导入页签，两入口共用一条解析路径
- [ ] 4.6 RED — 未登录访问该路由跳转到 `/login`；取数失败时侧栏仍在、只有内容区是错误态
- [ ] 4.7 GREEN — 加该路由的 `layout.tsx` 登录门与 `error.tsx`
- [ ] 4.8 VISUAL DIFF — bring up dev stack (`npm run dev --prefix frontend`)；打开 2025 银组最长的那份名单（26 人）对应的 `/utr`，对照 mocks 核对文案与色档；把窗口调矮确认长表有自己的滚动容器
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 差异屏

### Contract
- **Spec**: 确认屏 SHALL 呈现按字段的改动计数、每名队员逐字段的旧值与新值（未改动的字段显示为「不变」而不是省略）、全部错误及其原因、本表覆盖人数与该队未包含人数、以及本批中同时属于其他组别名单的队员。存在任何错误时，确认按钮 SHALL 处于禁用状态并说明还剩几条要解决。
- **Runtime**: `cd frontend && npm run test -- utr` → expected: 全部通过；随后 `npx tsc --noEmit` 无错误
- **Code**:
  - D5：按人分组的版式由负责人在视觉稿上选定；顶部按字段的改动计数是必需的，它替代了逐字段表格天然具备的「一竖排都在变」这个整列粘错信号。计数明显偏高的格子标 warning 底。
  - 「不变」占位显示不省略 —— 省掉之后满屏都是变动，反而看不出「这个人我只动了双打」。
  - 色档沿用既有三档：warning 用于计数偏高与跨组提示，中性用于「未包含 N 人」，danger 只用于「被拒绝」标记。
- **Threshold**: 70

- [ ] 5.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — open docs/superpowers/specs/mocks/2026-08-31-current-utr-source-mocks.html 的「差异屏」一节；抄下计数条、逐人行、错误段、禁用按钮的文案与色档
- [ ] 5.2 RED — vitest：某人只改双打时，该行显示双打旧→新，单打与链接显示「不变」
- [ ] 5.3 GREEN — 实现逐人行
- [ ] 5.4 RED — 顶部按字段计数正确；计数偏高的格子命中 warning 档 token
- [ ] 5.5 GREEN — 实现计数条
- [ ] 5.6 RED — 有错误时确认按钮 disabled 且旁注写明剩几条；无错误时可点
- [ ] 5.7 GREEN — 实现按钮状态
- [ ] 5.8 RED — 「本表覆盖 N 人，另外 M 人未包含」命中中性档；跨组队员在顶部与行内都被点名
- [ ] 5.9 GREEN — 实现这两处提示
- [ ] 5.10 VISUAL DIFF — bring up dev stack；构造一份含改动、错误、未包含与跨组四种情形的真实输入，对照 mocks 核对；用 computed style 实测所有新文案的对比度 ≥ 4.5:1
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 名单页就地编辑

### Contract
- **Spec**: 已登录时，名单表的每一行 SHALL 提供进入编辑态的入口；进入后整行变为输入，保存后该行变回只读并立即显示新值。一次只编辑一名队员，MUST NOT 提供「同屏改多人」。页面 SHALL 同时提供通往该队批量导入的入口。未登录时名单页 SHALL NOT 呈现行内编辑入口，也 SHALL NOT 呈现通往批量导入的入口。隐藏入口只是界面上的事：写接口本身 SHALL 独立拒绝没有管理员凭据的请求。
- **Runtime**: `cd frontend && npm run test -- RosterTable` → expected: 全部通过；随后 `npx tsc --noEmit` 无错误
- **Code**:
  - 边界划在「一个人」与「一队人」：就地编辑一次只能改一名队员，不提供同屏多改 —— 那正是批量导入要解决的事，两条路做同一件事会让人不知道该用哪条。
  - 两层保护都要有：藏按钮之外，写接口独立拒绝无凭据的请求。只靠藏按钮等于没有保护。
  - 现有 `RosterTable` 是无状态的展示组件；加编辑态时不要把整表变成客户端组件，只让需要交互的那一行是。
- **Threshold**: 70

- [ ] 6.0 CONTRACT — write openspec/changes/current-utr-source/contracts/group-6.md with the ### Contract block above
- [ ] 6.1 MOCK — open docs/superpowers/specs/mocks/2026-08-31-current-utr-source-mocks.html 的「名单页就地改」一节；抄下编辑态行的形态、按钮文案与右上角入口
- [ ] 6.2 RED — vitest：已登录时每行有编辑入口，点击后该行变输入态、其余行不变
- [ ] 6.3 GREEN — 实现行内编辑态
- [ ] 6.4 RED — 保存后该行显示新值并回到只读
- [ ] 6.5 GREEN — 接上 Server Action
- [ ] 6.6 RED — 未登录时行内入口与右上角批量导入入口都不渲染，名单照常可读
- [ ] 6.7 GREEN — 按登录态渲染入口
- [ ] 6.8 VISUAL DIFF — bring up dev stack；登录后在 2025 银组某队名单页改一个人的当前双打为 rated，保存；确认该队排阵页上此人的来源变为 `估算 · 当前已认证值`（前提是他本赛季无参赛 UTR）
- [ ] 6.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-6.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 7. 验证与 ship

- [ ] 7.1 Run backend test suite — `cd backend && ./.venv-std/Scripts/python.exe -m pytest`（本机 `uv run` 被 Application Control 拦，见 CLAUDE.md）
- [ ] 7.2 Run frontend test suite — `cd frontend && npm run test`
- [ ] 7.3 Run `cd frontend && npx tsc --noEmit` — vitest 只转译不校验类型，这条必须单独跑
- [ ] 7.4 端到端手工核对一次真实往返：导出 2025 银组某队 → 在表里填两个人 → 贴回 → 差异屏 → 确认 → 名单页可见。**做视觉核对前不要跑 pytest**（它会清空本地库，见 CLAUDE.md）
- [ ] 7.5 手工核对部署顺序：后端先上、前端后上
- [ ] 7.6 Run superpowers:verification-before-completion（跑 project.test_commands、console.log 扫描、以及 openspec/config.yaml 里的全部 custom_verification_checks）
