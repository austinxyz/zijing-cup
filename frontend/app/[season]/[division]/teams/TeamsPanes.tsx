"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/cn";

/**
 * The two team columns, with narrow-viewport visibility.
 *
 * One route, one DOM, served to every device — the breakpoint decides what
 * shows, never a user-agent sniff (the server has no viewport to sniff, and a
 * device split would fork the cache by device too). Desktop shows both columns
 * side by side; on mobile exactly one is visible, chosen by whether a team is
 * in the URL:
 *   - no team (/teams) → the list is the content; the roster pane is hidden,
 *     which also hides its "从左侧选一支球队" prompt that points at a column
 *     that is not there on mobile.
 *   - a team (/teams/CODE) → the roster fills the screen; the list is hidden,
 *     reachable again through the roster's back link.
 */
export function TeamsPanes({
  list,
  children,
}: {
  list: React.ReactNode;
  children: React.ReactNode;
}) {
  const selected = useSelectedLayoutSegment();

  return (
    <div className="flex min-h-0 flex-1">
      <div className={cn("min-h-0 md:flex", selected ? "hidden" : "flex")}>
        {list}
      </div>
      <main
        className={cn(
          "min-w-0 flex-1 flex-col overflow-hidden bg-background md:flex",
          selected ? "flex" : "hidden",
        )}
      >
        {children}
      </main>
    </div>
  );
}
