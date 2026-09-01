---
Date: 2026-08-31
Change: lineup-results-redesign
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-31-lineup-results-redesign-requirements.md
---

## Why

排阵页的候选阵容是 20 张叠卡，每卡把五线塞进五个 `flex-1` 窄列，一对搭配在窄列里换行成
~116px 高、整卡 ~177px，20 套是一条 ~3500px 长滚动。用法是「快速扫、挑一套」，而 Top
几套常常总和相同——同分时靠**具体搭配与关键人位置**来挑，可现在搭配被挤得读不了、跨套
又没法对齐比。负责人原话：**太挤，翻阅很不方便**。

## What Changes

- **桌面：候选叠卡 → 对比表。** 行 = 候选（≤20），列 = 名次 / 总和 / buffer +
  D1/D2/D3/MD/WD。列对齐、名字不换行（过长截断），竖扫一列即看「谁在这条线」，同分不同
  搭配一眼分辨；表头滚动时钉住。
- **手机：候选叠卡 → 紧凑行 + 点开。** 每套一行（名次 + 总和 + D1 签名 + 代价角标），
  点开展开五线纵向堆叠、名字不换行。
- **既有合法性信号全部保留**：估算值标两处（名字旁 + 整套「含 N 个估算值」）、超 cap 的
  「超 N」、buffer `spent/total` 两位小数、性别、开放线「无上限」。
- 顺带修稿子里量出的对比度（名次/箭头曾用 `#a09a90` 2.79 → `#706a61`）——实现时新做的
  表/行显式给 `bg-surface`，量 computed style。

无破坏性变更：无 API 变化、无数据库变化、后端不动、顶部摘要区与非正常态面板不动。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `lineup-ui` —— 改的是「有候选」时的候选呈现（`LineupResults` 的候选列表部分 +
  `CandidateCard`），换成对比表（桌面）与紧凑行/展开（手机）。顶部摘要区、约束抽屉、
  无解/非法锁定/截断面板不在本次范围。

## Impact

- `frontend/app/[season]/[division]/lineup/[code]/LineupResults.tsx` —— 候选列表段
  重写为对比表（桌面）与紧凑行列表（手机），两套 DOM 由 `md` 断点切；顶部摘要区那段
  原样保留。
- 可能拆出新组件（如 `CandidateTable` / `CandidateRow`）承载两种呈现，`CandidateCard`
  退役。判定逻辑（估算标记、超 cap、buffer 文案、性别）抽成共用纯函数，两套 DOM 只排版。
- `frontend/app/[season]/[division]/lineup/[code]/LineupResults.test.tsx` —— 既有断言
  按新 DOM 调整（内容不变、结构变）。
- 不动后端、不动 `lib/api.ts` 类型、无 migration。

## Out of Scope

- **关键人高亮**（点名字、所有候选里高亮他）——直接服务「关键人位置」，但要加交互与
  客户端状态，后续单列。对比表靠列对齐 + 竖扫让人自己找，本次不做任何高亮/筛选。
- **顶部摘要区**（可达上限 / 规则允许 / 差值 / 同分组数 / 锁定代价 / 未裁决 / 缺 UTR）——
  不改。
- **后端 / 搜索 / 排序 / 去重 / `keep=20`**——不动；前端不重排候选。
- 无解 / 非法锁定 / 截断等非正常态面板——不改。
- 导出 / 分享 / 收藏某套阵容。
