---
Date: 2026-10-02
Change: lineup-publish
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# lineup-publish — 阵容可开放

已存阵容（saved lineups）现为管理员机密：排阵页已存区、`/lineup…/saved` 页、对手对比页
三处都按 `canEdit(season, division)` 挡——非管理员（免密队员）一套都看不到。本 change 加一个
**逐套的「公开」开关**：管理员把某套已存阵容标为公开后，免密队员也能看到它的**阵容组合**
（谁上场、排哪条线、参赛 UTR），包括在对手对比页里拿两队的公开阵容做即席逐线对比——不必解锁
管理员。机密细节（每线备注、阵容评论、队员评价、管理员存的「已存对比」卡）仍只对管理员可见。

## Goals

1. **逐套公开开关。** `saved_lineups` 加 `is_public`（bool, NOT NULL, default false）。管理员
   （`canEdit`）在已存阵容卡上有一个「公开/取消公开」开关，写经 `adminWrite`；默认私密。
2. **免密队员可见公开阵容的阵容组合。** 非管理员在以下两处看到**仅 `is_public`** 的阵容，且
   **只读**（无任何编辑/改名/克隆/删除/保存/评论控件）：
   - `/lineup…/saved` 页 + 排阵页「已存阵容」区；
   - `/compare` 对手对比页：对非管理员开放，两侧 picker 只列该队的公开阵容，可选、可做即席逐线
     对比（上场预览 + 逐线并排 + 差距 + 总和 + 四态）。
3. **露出的只是阵容组合。** 逐线 10 人 + 性别 + 参赛 UTR + 线和/总和 + 四态状态（valid/utr_moved/
   illegal/player_gone）。**不露**：每线备注、阵容评论、队员评价（均仍 `canEdit`）。
4. **server 端过滤。** 三页对非管理员改为**始终取**已存阵容（取数在 backend-secret 之后、在 Next
   server），但**在 server 端按 `canEdit || is_public` 过滤后再渲染**，非管理员浏览器只拿到公开的
   那些。机密旁支（player notes / lineup comments / `getSavedComparisons`）对非管理员仍不取。

## Non-Goals

- 不公开任何机密旁支内容：每线备注、阵容评论、队员评价、管理员存的「已存对比」卡——对非管理员仍隐。
- 不做分享链接/二维码、不做「公开只给某些人」的细粒度授权（公开=对所有免密访问者可见）。
- 不改排阵引擎、不改 UTR 来源、不加多用户登录。
- 不公开排阵搜索本身（候选结果）——只公开**已存**且标记公开的阵容。
- 不动「已存对比」(saved_comparisons) 的机密性（本 change 不碰那张表的可见性）。

## Constraints

- 架构不可违反：读经 `lib/api.ts` 单一出口，写经 `lib/admin.ts` 的 `adminWrite`（scope
  `{season,division}`）+ 成功 `revalidatePath`；只有 FastAPI 访问库。
- `is_public` 列在 `zijing_cup` schema；migration `set search_path` 打头、schema-qualified、
  server_default false；远程共享 Supabase 走 Dashboard 手工执行（no-CLI-push），**push 读新列的
  后端前先建列**；前端读路径对缺列降级（视作全部私密）。
- **机密默认**：新列默认 false；任何「忘了设就公开」的方向都不允许——未显式公开即私密。
- 写开关靠 `WRITE_METHODS` 方法判权中间件自动保护（不加前缀/依赖式鉴权）。
- 过滤必须在 **server 端**（Next server component）完成，绝不能把非公开阵容发到非管理员浏览器再
  用 CSS 藏——那等于泄露。
- compare 非管理员版：不发 `getSavedComparisons`、不发 notes、无保存/备注/删除入口；锁定态文案改为
  公开可用的说明（不再是「管理员机密，请解锁」）。
- 只读态每套阵容卡：不渲染评论区、不渲染编辑/改名/克隆/删除/公开开关；公开开关只在 `canEdit` 出。

## Success Criteria

- 管理员把某套阵容切「公开」→ `is_public=true` 落库；免密访客刷新后在 saved 页/排阵页已存区看到这
  一套（只读、无控件、无评论），私密的仍不显。
- 免密访客进 `/compare`：两侧选两支队的公开阵容 → 逐线对比正常；看不到任何「已存对比」卡、看不到每线
  备注、无保存入口。某队无公开阵容时该侧 picker 空。
- 管理员视图不变：看到全部阵容（公开+私密）+ 全部控件 + 评论 + 已存对比卡。
- 非公开阵容的任何字段都不出现在非管理员收到的 HTML/JSON 里（server 端过滤，实测）。
- 读端点/缺列降级：`is_public` 列未建时三页不崩，按全部私密处理（非管理员看不到任何阵容）。
- 真实数据实测：标一套公开 → 免密看到；取消公开 → 免密立即看不到；compare 免密只对公开阵容可比。

## User Stories

- 作为队长，我想把某套排好的阵容「公开」，让本队/对手的队员不用管理员密码就能看到这套怎么排。
- 作为普通队员（没有密码），我想在对手对比页看到对手队已公开的阵容组合，判断我方怎么应对。
- 作为管理员，我不想因为公开了阵容组合就连带泄露我的每线备注、评论和「已存对比」预案。

## Open Questions

- 公开开关放在卡头的什么位置、文案（「公开」/「仅管理员」badge + toggle）——Phase 4 mock 定。
- compare 非管理员锁定态替换文案的具体措辞——Phase 4 定。
- 是否在卡上给管理员一个「公开中」可见标记（让管理员一眼看出哪些已外露）——倾向要，mock 定。

## Referenced Capabilities

- `lineup-saved-lineups`（本 change 给 saved lineup 加 `is_public` + 只读展示；读写端点）。
- `lineup-ui`（排阵页已存区、`SavedLineups` 组件加只读模式）。
- `opponent-compare` / `opponent-compare-enhance`（compare 页对非管理员开放、picker 只列公开阵容；
  已存对比卡/备注仍机密）。
- `app-shell` / `scoped-admin-auth`（canEdit 门、adminWrite scope、server 端过滤范式）。
