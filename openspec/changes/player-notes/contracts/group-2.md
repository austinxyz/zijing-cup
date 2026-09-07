### Contract
- **Spec**: player-notes —— GET/POST/DELETE 的前端出口；「写入经 `adminWrite` 按比赛 scope 判权」；「空文本不写」。
- **Runtime**: `cd frontend && npm run test -- notes` → expected: `getPlayerNotes` 请求 URL + 非 ok 降级 []、`addPlayerNote`/`deletePlayerNote` 调 adminWrite 参数/scope 的单测过；`npx tsc --noEmit` 干净。
- **Code**: `lib/api.ts` 加 `PlayerNote`（category literal union）+ `getPlayerNotes`（**非 ok 返回 []** 降级，远程 migration 滞后不打崩详情页）；players `actions.ts` 加 `addPlayerNote`（POST，body trim）/`deletePlayerNote`（DELETE），经 `adminWrite` scope `{season,division}`，成功 `revalidatePath`。
- **Threshold**: 80

