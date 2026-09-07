### Contract
- **Spec**: player-notes —— 「系统 SHALL 有一张 `player_notes` 表…`category` 限定 strength/weakness/partner/other（DB check）…`created_at` server_default now() NOT NULL…写入 SHALL 追加、MUST NOT 覆盖」；「GET 倒序、POST 追加、DELETE 删一条；GET 需 X-Backend-Secret、POST/DELETE 按方法自动需 X-Admin-Secret；空 body 拒；MUST NOT 提供就地编辑端点」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "note"` → expected: 表/端点单测过（追加不覆盖、倒序、category 约束、空 body 拒、删一条）；无 import 错。
- **Code**: `PlayerNote` model——`created_at` 用 `sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False)`（别 `Optional[datetime]=None`，会发 NULL）；migration 以 `set search_path to zijing_cup, public;` 开头、category CHECK 约束；router GET `order_by(created_at.desc())`/POST 校验 body 非空+球员存在/DELETE 按 (player_id,note_id)；注册进 main + models/__init__；**不做**编辑端点。
- **Threshold**: 80

