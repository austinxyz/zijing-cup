"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { LineupPlayer } from "@/lib/api";
import { constraintSummary } from "./summary";

/**
 * The narrow-viewport frame for the lineup controls.
 *
 * Results lead; the controls fold into a bottom sheet. The closed state is not
 * silent: it shows the constraints in force, named — a constrained result and
 * the unconstrained best look alike, and a count alone still forces the sheet
 * open to learn who. The sheet holds the real controls form unchanged, so the
 * search stays behind its own submit: editing constraints never auto-fires a
 * search, which on the cold free instance is a full solve.
 *
 * md:hidden throughout — the desktop keeps the controls as a left column.
 */
export function LineupMobileControls({
  controls,
  locks,
  excluded,
  roster,
}: {
  controls: React.ReactNode;
  locks: Record<string, [string, string]>;
  excluded: string[];
  roster: LineupPlayer[];
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const summary = constraintSummary(locks, excluded, roster);

  useEffect(() => {
    if (!open) return;
    // The first form control, not the header's close button (which comes
    // first in DOM order) — focus should land where the editing happens.
    const first = panel.current?.querySelector<HTMLElement>(
      'form select, form input, form button, [role="search"] select',
    );
    first?.focus();
  }, [open]);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between gap-2.5 border-b border-border bg-surface px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {summary}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 flex-none items-center gap-1 rounded-token border border-border bg-surface px-3 text-[12.5px] text-primary"
        >
          改约束
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 6.5L8 10.5L12 6.5" />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="fixed inset-0 z-40 flex flex-col justify-end"
        >
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[#1a1917]/45"
          />
          <div
            ref={panel}
            className="relative flex max-h-[85%] flex-col rounded-t-2xl bg-surface"
          >
            <div className="flex flex-none items-center justify-between border-b border-border px-4 py-3">
              <span
                id={titleId}
                className="text-[14px] font-semibold text-foreground"
              >
                约束
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12.5px] text-muted-foreground"
              >
                关闭
              </button>
            </div>
            {/* The real controls form. Its own submit is the only way a search
                fires; the sheet adds no onChange navigation. */}
            <div className="flex-1 overflow-y-auto">{controls}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
