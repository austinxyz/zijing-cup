"use client";

import { useState, useTransition } from "react";

interface SaveInput {
  name: string;
  team_a_code: string;
  lineup_a_id: number;
  team_b_code: string;
  lineup_b_id: number;
}

/**
 * The 新建 row: name the current picker selection and save it as a comparison
 * card. Shown only once BOTH sides are fully selected (team + lineup) — an
 * incomplete pick has nothing to compare, so nothing to save.
 */
export function CompareSaveBar({
  selection,
  onSave,
}: {
  selection: { a: string; al: string; b: string; bl: string };
  onSave: (input: SaveInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { a, al, b, bl } = selection;
  if (!a || !al || !b || !bl) return null;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        await onSave({
          name: trimmed,
          team_a_code: a,
          lineup_a_id: Number(al),
          team_b_code: b,
          lineup_b_id: Number(bl),
        });
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败，请重试。");
      }
    });
  }

  return (
    <div className="flex flex-none flex-col gap-1 border-b border-border bg-surface-muted px-5 pb-3">
      <div className="flex items-center gap-2">
        <input
          aria-label="对比名称"
          value={name}
          disabled={pending}
          placeholder="给当前搭配起个名，保存成一张对比卡…"
          onChange={(e) => setName(e.target.value)}
          className="h-8 flex-1 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground placeholder:text-muted-foreground disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending || name.trim() === ""}
          onClick={save}
          className="h-8 flex-none rounded-token bg-primary px-3.5 text-[12.5px] text-primary-foreground disabled:opacity-50"
        >
          保存对比
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
