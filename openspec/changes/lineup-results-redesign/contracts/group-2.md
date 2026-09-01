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
