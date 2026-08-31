"use client";

import { useState, useTransition } from "react";

import type { UtrSheetRow } from "@/lib/api";
import { applySheet, previewSheet, type SheetDiff } from "./actions";
import { UtrDiff } from "./UtrDiff";
import { UtrExport } from "./UtrExport";
import { UtrImport } from "./UtrImport";

type Tab = "export" | "import";

/**
 * Export and import, and the confirmation screen between import and writing.
 *
 * The two live on one panel because they are two halves of one trip: you take
 * the sheet away here and bring it back here. The diff replaces the import
 * form rather than opening beside it — there is exactly one decision to make
 * at that point, and the form it came from is not part of it.
 */
export function UtrPanel({
  rows,
  season,
  division,
  teamCode,
}: {
  rows: UtrSheetRow[];
  season: string;
  division: string;
  teamCode: string;
}) {
  const [tab, setTab] = useState<Tab>("export");
  const [diff, setDiff] = useState<SheetDiff | null>(null);
  const [text, setText] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function preview(submitted: string) {
    setFailure(null);
    startTransition(async () => {
      try {
        setText(submitted);
        setDiff(await previewSheet(season, division, teamCode, submitted));
      } catch {
        setFailure("读不到差异——后端可能正在冷启动，稍候再试一次。");
      }
    });
  }

  function apply() {
    setFailure(null);
    startTransition(async () => {
      try {
        await applySheet(season, division, teamCode, text);
        setDiff(null);
        setText("");
        setTab("export");
      } catch {
        setFailure("写入没有成功——这一批一处也没有落库，可以直接重试。");
      }
    });
  }

  return (
    // An explicit surface, not the page ground: `--color-muted` measures
    // 4.69:1 on white and 4.27:1 on the page's own #f6f4f0, so a panel that
    // forgets its background quietly drops every muted label below the
    // threshold.
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex flex-none border-b border-border">
        {(
          [
            ["export", "导出"],
            ["import", "导入"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setDiff(null);
            }}
            className={`px-4 py-2.5 text-[12.5px] ${
              tab === id
                ? "border-b-2 border-b-foreground font-medium text-foreground"
                : "border-b-2 border-b-transparent text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {failure ? (
        <p className="flex-none border-b border-warning-border bg-warning-surface px-3.5 py-2 text-[12px] text-warning">
          {failure}
        </p>
      ) : null}

      {tab === "export" ? (
        <UtrExport rows={rows} />
      ) : diff === null ? (
        <UtrImport onSubmit={preview} pending={pending} />
      ) : (
        <UtrDiff
          diff={diff}
          pending={pending}
          onApply={apply}
          onBack={() => setDiff(null)}
        />
      )}
    </div>
  );
}
