"use client";

import Link from "next/link";

import { EditOnly } from "./PlayerEditContext";

/**
 * Edit-mode actions for the detail pane. These are entry LINKS to the existing
 * flows (merge / split each have their own confirmation page; ruling lives in
 * the unresolved queue) rather than inline forms — the irreversible operations
 * keep their full "here is what will happen" pages. Wrapped in EditOnly so a
 * read-only viewer never sees them.
 */
export function PlayerDetailActions({
  season,
  division,
  playerId,
  hasContested,
}: {
  season: string;
  division: string;
  playerId: number;
  hasContested: boolean;
}) {
  const base = `/${season}/${division}/players`;
  const btn =
    "inline-flex min-h-9 items-center rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground no-underline";
  return (
    <EditOnly>
      <div className="flex flex-none flex-wrap items-center gap-2">
        {hasContested ? (
          <Link href={`${base}/unresolved`} className={btn}>
            裁决参赛 UTR…
          </Link>
        ) : null}
        <Link href={`${base}/${playerId}/merge`} className={btn}>
          合并到另一条记录…
        </Link>
        <Link
          href={`${base}/${playerId}/split`}
          className="inline-flex min-h-9 items-center rounded-token border border-danger-border bg-danger-surface px-3 text-[12.5px] text-danger no-underline"
        >
          拆分这条记录…
        </Link>
      </div>
    </EditOnly>
  );
}
