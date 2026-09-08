## Contract — Group 1: 后端 lineup_comments 表 + migration + 端点

- **Spec**:
  - 系统 SHALL 有一张 `lineup_comments` 表：`saved_lineup_id` FK → `saved_lineups(id)` `on delete cascade`；`body` text（长度 1–2000，DB CHECK）；`created_at` server_default now() NOT NULL。写入 SHALL 追加、MUST NOT 覆盖。删阵容 SHALL 级联删其评论。
  - 系统 SHALL 提供：单阵容 GET 列出（倒序 `created_at desc, id desc`）、POST 追加、DELETE 删一条（按 saved_lineup_id + comment id）；以及批量读端点 `GET /api/…/lineup-comments?ids=…`，按 saved_lineup_id 分组返回、只放有评论的 id、ids 去重/忽略非法/clamp、空 ids → 空映射。GET 需 X-Backend-Secret；POST/DELETE 按方法自动需 X-Admin-Secret。空 body 拒；超长（>2000）拒为 422（不落 500）。MUST NOT 提供就地编辑端点。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_lineup_comments.py -q`（本地需 BACKEND_SECRET/ADMIN_SECRET env）→ expected: 全部通过，无 import 错；覆盖批量倒序分组、空 body/超长 422、鉴权 401/403、跨阵容删 404、级联删。
- **Code**:
  - `LineupComment` 模型 `created_at` 用 `sa_column=Column(DateTime(tz), server_default=func.now(), nullable=False)`——别 `Optional=None`（会发 NULL，CLAUDE.md）。
  - migration 以 `set search_path to zijing_cup, public;` 开头 + `body` 长度 CHECK + FK `on delete cascade` + `(saved_lineup_id, created_at desc)` 索引；本地按整份文件一次 `execute`（断言 `127.0.0.1`），别按 `;` 切句。
  - 批量路由 `…/lineup-comments` 声明**在**任何 `/{id}/comments` 之前，避免被路径参数吃掉；配一条"路由确实注册"断言。
  - `CommentIn.body` = `Field(min_length=1, max_length=2000)` + trim（纯空白拒 422）；`_parse_ids` 去重/忽略非法/clamp≤200。
  - 写鉴权靠方法判权中间件自动生效——不加前缀判断、不加依赖。
- **Threshold**: 80
