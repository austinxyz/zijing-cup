"use client";

import { useState, useTransition } from "react";

import type { CompareSeatView, SavedComparisonView } from "./comparisonView";

interface CompareSavedCardsProps {
  views: SavedComparisonView[];
  /** Editing (note + delete) is admin-only; the page passes canEdit through. */
  canEdit: boolean;
  onSetNote?: (id: number, line: string, text: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

function fmtDiff(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}
function diffCls(n: number | null): string {
  if (n == null || n === 0) return "text-muted";
  return n > 0 ? "text-success" : "text-danger";
}
function gtoken(g: string | null): string {
  return g === "M" ? "♂" : g === "F" ? "♀" : "·";
}
function gcls(g: string | null): string {
  return g === "M" ? "text-male" : g === "F" ? "text-female" : "text-muted-foreground";
}

function Seats({ seats }: { seats: CompareSeatView[] | null }) {
  if (seats === null) {
    return <span className="text-warning">阵容已删</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1 text-[12.5px]">
      {seats.length === 0
        ? "—"
        : seats.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 ? <span className="text-muted-foreground">·</span> : null}
              {p.name}
              <span className={`font-bold ${gcls(p.gender)}`}>{gtoken(p.gender)}</span>
            </span>
          ))}
    </span>
  );
}

function NoteCell({
  view,
  line,
  note,
  canEdit,
  onSetNote,
}: {
  view: SavedComparisonView;
  line: string;
  note: string;
  canEdit: boolean;
  onSetNote?: (id: number, line: string, text: string) => Promise<void>;
}) {
  const [value, setValue] = useState(note);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return note ? <span className="text-[12px] text-foreground">{note}</span> : null;
  }
  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label={`${line} 本线备注`}
        value={value}
        disabled={pending}
        placeholder="＋ 记本线备注"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== note && onSetNote) {
            setError(null);
            start(async () => {
              try {
                await onSetNote(view.id, line, value);
              } catch (e) {
                // A failed write must not look saved: surface it and roll the
                // field back to the last persisted value.
                setError(e instanceof Error ? e.message : "保存失败，请重试。");
                setValue(note);
              }
            });
          }
        }}
        className="w-full rounded-token border border-dashed border-border bg-surface px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground disabled:opacity-50"
      />
      {error ? (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function Card({
  view,
  canEdit,
  onSetNote,
  onDelete,
}: {
  view: SavedComparisonView;
  canEdit: boolean;
  onSetNote?: (id: number, line: string, text: string) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mb-2 overflow-hidden rounded-token border border-border bg-surface">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="w-[13px] flex-none text-[11px] text-muted-foreground">
            {open ? "▾" : "▸"}
          </span>
          <span className="text-[13px] font-semibold text-foreground">{view.name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {view.aLabel} · vs · {view.bLabel}
          </span>
        </button>
        {canEdit && onDelete ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                try {
                  await onDelete(view.id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "删除失败，请重试。");
                }
              });
            }}
            className="flex-none rounded-token border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground disabled:opacity-50"
          >
            删除
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-2.5 pb-1.5 text-[11px] text-danger">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="border-t border-border px-2.5 py-2">
          <div className="overflow-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="w-[46px] border-b border-border bg-surface-muted px-2.5 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground">线位</th>
                  <th className="border-b border-border bg-surface-muted px-2.5 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground">我方</th>
                  <th className="w-[70px] border-b border-border bg-surface-muted px-2.5 py-1.5 text-center font-mono text-[10.5px] text-muted-foreground">差距</th>
                  <th className="border-b border-border bg-surface-muted px-2.5 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground">对手</th>
                  <th className="min-w-[150px] border-b border-border bg-surface-muted px-2.5 py-1.5 text-left font-mono text-[10.5px] text-muted-foreground">本线备注</th>
                </tr>
              </thead>
              <tbody>
                {view.lines.map((l) => (
                  <tr key={l.line} aria-label={l.line}>
                    <td className="border-b border-border/60 px-2.5 py-1.5 font-mono font-semibold">{l.line}</td>
                    <td className="border-b border-border/60 px-2.5 py-1.5"><Seats seats={l.a} /></td>
                    <td className={`border-b border-border/60 px-2.5 py-1.5 text-center font-mono font-semibold ${diffCls(l.diff)}`}>{fmtDiff(l.diff)}</td>
                    <td className="border-b border-border/60 px-2.5 py-1.5"><Seats seats={l.b} /></td>
                    <td className="border-b border-border/60 px-2.5 py-1.5">
                      <NoteCell view={view} line={l.line} note={l.note} canEdit={canEdit} onSetNote={onSetNote} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="bg-surface-muted px-2.5 py-1.5 font-mono font-semibold">总和</td>
                  <td className="bg-surface-muted px-2.5 py-1.5 font-mono">{view.totalA ?? "—"}</td>
                  <td className={`bg-surface-muted px-2.5 py-1.5 text-center font-mono font-semibold ${diffCls(view.totalDiff)}`}>{fmtDiff(view.totalDiff)}</td>
                  <td className="bg-surface-muted px-2.5 py-1.5 font-mono">{view.totalB ?? "—"}</td>
                  <td className="bg-surface-muted px-2.5 py-1.5" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The 「已存对比」 region: one collapsible card per saved comparison. A card
 * expands IN PLACE to render its line-by-line comparison (recomputed from the
 * referenced lineups' current state) + per-line notes — it does not navigate,
 * change the URL, or touch the picker below.
 */
export function CompareSavedCards({ views, canEdit, onSetNote, onDelete }: CompareSavedCardsProps) {
  if (views.length === 0) return null;
  return (
    <div className="flex flex-col">
      {views.map((v) => (
        <Card key={v.id} view={v} canEdit={canEdit} onSetNote={onSetNote} onDelete={onDelete} />
      ))}
    </div>
  );
}
