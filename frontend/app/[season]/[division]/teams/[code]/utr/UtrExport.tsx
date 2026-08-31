"use client";

import { useState } from "react";

import type { UtrSheetRow } from "@/lib/api";

/** The columns, in the order the import expects them back. */
const COLUMNS = [
  "id",
  "姓",
  "名",
  "当前单打",
  "单打状态",
  "当前双打",
  "双打状态",
  "UTR链接",
] as const;

/** The three the person must not touch: they are the row's identity. */
const FIXED_COLUMNS = 3;

function cellsOf(row: UtrSheetRow): string[] {
  return [
    String(row.player_id),
    row.last_name,
    row.first_name,
    row.singles_utr ?? "",
    row.singles_status ?? "",
    row.doubles_utr ?? "",
    row.doubles_status ?? "",
    row.utr_profile_id ?? "",
  ];
}

/** Quote a cell the way the parser expects to read it back.
 *
 *  Names really do contain commas. Writing one unquoted shifts the whole row
 *  one column over on the way back in — the single most damaging way this
 *  round trip can fail, and one the person would have no reason to suspect.
 */
function quote(cell: string, delimiter: string): string {
  if (
    !cell.includes(delimiter) &&
    !cell.includes('"') &&
    !cell.includes("\n")
  ) {
    return cell;
  }
  return `"${cell.replace(/"/g, '""')}"`;
}

function asText(rows: UtrSheetRow[], delimiter: string): string {
  return [
    COLUMNS.join(delimiter),
    ...rows.map((row) =>
      cellsOf(row)
        .map((cell) => quote(cell, delimiter))
        .join(delimiter),
    ),
  ].join("\n");
}

/**
 * The sheet on its way out.
 *
 * Existing values go out filled in, so the person edits in place rather than
 * retyping a column they only meant to touch three cells of.
 */
export function UtrExport({ rows }: { rows: UtrSheetRow[] }) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  async function copyAll() {
    try {
      // Tabs, because that is what a spreadsheet reads off the clipboard.
      await navigator.clipboard.writeText(asText(rows, "\t"));
      setCopied("ok");
    } catch {
      // Said out loud, not swallowed. A silent failure here is the exact
      // shape of mistake this feature exists to prevent: the person walks
      // away believing they have the sheet.
      setCopied("failed");
    }
  }

  function downloadCsv() {
    const blob = new Blob([asText(rows, ",")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "current-utr.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex-none border-b border-border bg-surface-muted px-3.5 py-2 text-[12px] leading-relaxed text-foreground">
        前三列是系统填好的，<strong>别改</strong> —— <code>id</code>{" "}
        决定这一行是谁，姓名是校验位。后五列你填：空着 = 不改，写{" "}
        <code>-</code> = 清空。
      </p>

      {/* Its own scroll container: the shell is h-screen overflow-hidden, so a
          list that can grow has to scroll here or it is silently cut off with
          no scrollbar to say so. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse bg-surface font-mono text-[11.5px]">
          <thead>
            <tr>
              {COLUMNS.map((name) => (
                <th
                  key={name}
                  className="sticky top-0 z-10 whitespace-nowrap border border-border bg-surface-muted px-2 py-1.5 text-left text-[10px] font-medium text-muted"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player_id}>
                {cellsOf(row).map((value, index) => (
                  <td
                    key={index}
                    className={`border border-[#eae7e0] px-2 py-1 ${
                      index < FIXED_COLUMNS
                        ? "bg-surface-muted text-muted"
                        : "text-foreground"
                    }`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-none items-center gap-2.5 border-t border-border bg-surface-muted px-3.5 py-2.5">
        <button
          type="button"
          onClick={copyAll}
          className="rounded-token bg-primary px-3 py-1.5 text-[12.5px] text-primary-foreground"
        >
          复制整张表
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          className="rounded-token border border-border bg-surface px-3 py-1.5 text-[12.5px] text-foreground"
        >
          下载 CSV
        </button>
        <span className="text-[11.5px] text-muted">
          {copied === "ok"
            ? "已复制，可以直接粘进 Google Sheets"
            : copied === "failed"
              ? "复制没有成功——浏览器挡住了剪贴板，改用「下载 CSV」。"
              : "已有的值也带出去，方便你看着改"}
        </span>
      </div>
    </div>
  );
}
