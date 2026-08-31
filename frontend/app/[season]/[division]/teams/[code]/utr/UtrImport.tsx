"use client";

import { useState } from "react";

/**
 * The sheet on its way back.
 *
 * Two entry points, one call. A paste and an upload that could disagree
 * would leave the reader with no way to tell which result to believe, so the
 * file is read to text here and handed to the same place the textarea's
 * contents go.
 */
export function UtrImport({
  onSubmit,
  pending = false,
}: {
  onSubmit: (text: string) => void;
  pending?: boolean;
}) {
  const [text, setText] = useState("");

  async function readFile(file: File | undefined) {
    if (!file) return;
    onSubmit(await file.text());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
      <label className="flex min-h-0 flex-1 flex-col gap-1.5">
        <span className="text-[12px] text-muted">
          从 Google Sheets 里整块复制，粘到这里（含表头那一行）
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-[140px] flex-1 rounded-token border border-border bg-surface px-3 py-2.5 font-mono text-[11.5px] text-foreground"
        />
      </label>

      <div className="flex-none text-center text-[11px] text-muted">或</div>

      <label className="flex-none cursor-pointer rounded-token border border-dashed border-border bg-surface-muted px-4 py-4 text-center text-[12px] text-muted">
        选择一个 CSV 文件
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => readFile(event.target.files?.[0])}
        />
      </label>

      <div className="flex flex-none items-center gap-2.5">
        <button
          type="button"
          disabled={pending || text.trim() === ""}
          onClick={() => {
            if (text.trim() !== "") onSubmit(text);
          }}
          className="rounded-token bg-primary px-3 py-1.5 text-[12.5px] text-primary-foreground disabled:opacity-50"
        >
          看差异
        </button>
        {/* The button's own word, because 「导入」 would read as "this lands
            now" — it does not; the next screen is where anything is decided. */}
        <span className="text-[11.5px] text-muted">不会直接写库</span>
      </div>
    </div>
  );
}
