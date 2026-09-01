### Contract
- **Spec**: `/[season]/[division]/teams/[code]/utr` SHALL 以两个页签承载导出与导入。导出页签呈现整张表（可整块复制）并提供下载 CSV；前三列 SHALL 在视觉上标明「不要修改」。导入页签同时提供粘贴框与文件上传两个入口，二者 SHALL 走同一套解析。提交按钮的文案 SHALL 表明它产生的是差异而不是写入。该路由 SHALL 自带登录门与 `error.tsx`。
- **Runtime**: `cd frontend && npm run test -- utr` → expected: 全部通过；随后 `npx tsc --noEmit` 无错误
- **Code**:
  - D7：`players/layout.tsx` 的登录门覆盖不到 `teams/` 下的路由，要照着再配一份；`error.tsx` 不能省 —— 路由没有自己的错误边界时，一次冷启动超时会从「某一块加载失败」变成「整个应用崩了」。
  - 两个入口必须走同一套解析：给出不同结果会让人无从判断该信哪个。
  - `lib/api.ts` 仍是读取的单一出口；写经 Server Action → `lib/admin.ts`。
  - 改完跑 `npx tsc --noEmit`：vitest 只转译不校验类型。
- **Threshold**: 70
