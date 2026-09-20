## Contract — Group 1: buildLoadHref 载入链接携带阵型名

- **Spec**:
  - 回填/文案是纯前端增强:载入链接 SHALL 多带一个 `preset=<名字>`(URL 编码)参数携带名字,`locks/pins/ex` 参数不变。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/presetLoad.test.ts` → expected: 新增用例全绿——`buildLoadHref` 输出含 `preset=<URL 编码名字>`,且 locks/pins/ex 参数与改前一致。
- **Code**:
  - `presetLoad.ts` `buildLoadHref`:在既有 params 上 `params.set("preset", preset.name)`(URLSearchParams 自动编码);不改 locks/pins/ex 的写法。
  - `preset` 参数只是携带名字,不进 `constraintsFromQuery`(它只认 locks/pins/ex),不影响搜索/重判。
- **Threshold**: 80
