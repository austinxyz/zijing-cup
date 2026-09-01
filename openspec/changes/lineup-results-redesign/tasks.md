## 1. 桌面对比表

### Contract
- **Spec**:
  - 「宽视口（≥ 768px）下，候选 SHALL 呈现为一张表：每套一行，列含名次、总和、buffer 与五条线（D1/D2/D3/MD/WD 各一列），使同一条线在各套之间**跨行对齐**、可竖向扫读。名字 SHALL 不换行，过长时截断……表 MUST NOT 横向溢出视口。」（lineup-ui）
  - 「表头 SHALL 在表体滚动时保持可见（钉住）……表体 SHALL 自带滚动容器。」（lineup-ui）
  - 「前端 MUST NOT 自行重排候选：按后端 `search.candidates` 的顺序渲染。」（lineup-ui）
  - 「每一套候选 SHALL 显示五条线各自的两名队员、性别、该线的参赛 UTR 之和、超出 cap 的量（若有），以及该套用掉的全队 buffer 与额度。」+ 估算标记两处、密集视图紧凑标记 + 图例保留整句。（lineup-ui MODIFIED）
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/` → expected: 对比表用例（列对齐/不换行/表头钉住/顺序即后端序/估算·超cap·buffer 标记）全绿，既有 lineup 用例不转红
- **Code**:
  - D1：用真 `<table>` + `table-fixed`（对齐是价值，flex 拼的伪表对不齐）；长名 `overflow:hidden`+`text-overflow:ellipsis`+`title` 全名；表头 `position:sticky top:0`，表体沿用既有滚动容器。
  - D3：判定逻辑（估算/超cap/buffer 文案/性别/开放线）抽成共用纯函数，桌面表与手机行都调它。
  - D4：表内估算用紧凑角标（数字 `˟` + 整套「估」badge）+ 底部图例给完整措辞「含 N 个估算值，合法性待总表确认」；标记不省略、整句不删只挪。
  - D5：不重排，按 `search.candidates` 序。
- **Threshold**: 70

- [ ] 1.0 CONTRACT — write openspec/changes/lineup-results-redesign/contracts/group-1.md with the ### Contract block above
- [ ] 1.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-31-lineup-results-redesign-mocks.html#desktop-table`；记下列（名次38/总和66/buffer78 + 五线均分）、行高 40px、名字不换行截断、表头钉住、估算 `˟`+「估」badge+图例、超cap 红「超 N」、buffer `spent/total` 两位、用既有 token（表头 `--color-muted` on `--color-surface-muted`）
- [ ] 1.2 RED — vitest：候选渲染为 `<table>`，`thead` 有名次/总和/buffer/D1/D2/D3/MD/WD 八列；20 套 → 20 个 tbody 行且顺序等于输入 `candidates` 顺序
- [ ] 1.3 GREEN — 抽 `candidateFlags`（或复用 estimatesIn/money）纯函数；新建 `CandidateTable`，`LineupResults` 的候选段在 ≥768 用它（`hidden md:*`）
- [ ] 1.4 RED — vitest：某队员 UTR 为推导值时其格带估算角标、整套带「估」标记且图例含「含 N 个估算值，合法性待总表确认」；某线超 cap 时该格标「超 N」；buffer 显示 `spent/total`；全 frozen 套无估算标记
- [ ] 1.5 GREEN — 实现格内标记 + 图例
- [ ] 1.6 VISUAL DIFF — 起 dev stack，1280×800，打开 20 套候选的排阵页（USTC-CMU-HQU）；对照 `#desktop-table`；量：无横向溢出、名字不换行截断、表头滚动钉住、表体滚到第 20 行、列对齐（D1 列各行左边缘一致）、对比度 0 不合格
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 手机紧凑行 + 展开

### Contract
- **Spec**:
  - 「窄视口（< 768px）下，候选 SHALL 呈现为逐行的紧凑列表：每套一行，显示名次、总和、一条签名（该套的 D1 搭配）、以及代价角标（含估算 / 超 cap，若有）。点开一行 SHALL 展开该套五条线的纵向堆叠，名字不换行；关上回到列表。列表 MUST NOT 横向溢出，且自带滚动容器。」（lineup-ui）
  - 估算/超cap/buffer/性别标记同 group 1（同一 MODIFIED 要求，手机展开态也要有）。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/` → expected: 紧凑行/展开/签名/代价角标用例全绿
- **Code**:
  - D2：手机是另一套紧凑行 DOM（不是把表塞进窄屏），`md:hidden` 与桌面表互斥；签名取 D1 搭配。
  - D3：复用 group 1 抽出的判定纯函数。
  - 展开/收起是纯本地 UI 状态；点开展开五线纵向堆叠、名字不换行。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/lineup-results-redesign/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — 打开 `#mobile-list`；记下紧凑行（名次20 + 总和大 56 + D1 签名 + 代价角标）、点开展开五线纵向（lcode 30 + 名字整行不换行 + 该线之和）、角标 含估算/超cap 用既有 warning/danger 档
- [ ] 2.2 RED — vitest：375 下候选是逐行列表（非 `<table>`），每行含名次/总和/D1 签名；含估算或超cap 的行带对应角标；全 frozen 无约束的行无角标
- [ ] 2.3 GREEN — 新建 `CandidateRow`（紧凑行 + 展开），`LineupResults` 候选段在 <768 用它（`md:hidden`）
- [ ] 2.4 RED — vitest：点开一行展开该套五线（五条，名字不换行）；再次点收起；展开态里估算/超cap 标记都在
- [ ] 2.5 GREEN — 实现展开/收起与五线堆叠
- [ ] 2.6 VISUAL DIFF — dev stack，375×667，打开 20 套候选的排阵页；对照 `#mobile-list`；量：无横向溢出、紧凑行签名+角标、点开五线纵向不换行、列表可滚到第 20 套、对比度 0 不合格。宽视口回看确认桌面走的是对比表
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与交付

- [ ] 3.1 跑前端测试 —— `cd frontend && npm run test`
- [ ] 3.2 类型检查 —— `cd frontend && npx tsc --noEmit`（vitest 不校验类型，单列）
- [ ] 3.3 后端测试 —— `cd backend && ./.venv-std/Scripts/python.exe -m pytest`（本次不动后端，确认无连带损伤）。**跑完本地库空**，看页面前先 `bash backend/scripts/reseed-local.sh` 等价补种（规则→名单→队名→清 players→migrate）
- [ ] 3.4 对比度终检 —— 排阵页 1280 与 375 各跑 computed-style 扫描，0 不合格；重点 est #8a6508 / over #b3261e / muted #6b665d / 表头 on #f2efe9
- [ ] 3.5 桌面/手机回归核对 —— 顶部摘要区、无解/非法锁定/截断面板、约束抽屉与改动前一致；只有候选区版式变了
- [ ] 3.6 Run superpowers:verification-before-completion —— 跑 `openspec/config.yaml` 的 `test_commands` 与全部 `custom_verification_checks`
- [ ] 3.7 `openspec validate lineup-results-redesign` 通过；`openspec status` 全 done
