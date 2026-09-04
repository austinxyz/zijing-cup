"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleSavedProps {
  /** How many saved lineups the section holds — shown in the header so the
   *  reader knows what folding hides. */
  count: number;
  children: ReactNode;
}

/**
 * The right pane's top section: the team's saved lineups, collapsible. Starts
 * expanded — the default view is meant to lead with these — and folds to a
 * single header row so a reader who wants the search below can push it up.
 * When the team has none, the header says so and there is nothing to expand.
 */
export function CollapsibleSaved({ count, children }: CollapsibleSavedProps) {
  const [open, setOpen] = useState(true);
  const has = count > 0;

  return (
    <section
      aria-label="已存阵容"
      className="flex-none border-b border-border"
    >
      <button
        type="button"
        onClick={() => has && setOpen((v) => !v)}
        aria-expanded={has ? open : undefined}
        disabled={!has}
        className="flex min-h-11 w-full items-center gap-2 px-5 py-2.5 text-left disabled:cursor-default"
      >
        {has ? (
          <svg
            viewBox="0 0 16 16" width="13" height="13" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            aria-hidden="true"
            className={`flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M6 3.5L10.5 8L6 12.5" />
          </svg>
        ) : (
          <span className="w-[13px] flex-none" />
        )}
        <span className="text-[13px] font-semibold text-foreground">已存阵容</span>
        <span className="text-[12px] text-muted-foreground">
          {has ? `${count} 套` : "还没有保存的阵容"}
        </span>
      </button>
      {has && open ? <div className="px-5 pb-4">{children}</div> : null}
    </section>
  );
}
