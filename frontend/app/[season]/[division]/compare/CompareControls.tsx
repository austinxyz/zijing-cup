"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SavedLineup, TeamSummary } from "@/lib/api";

/**
 * The two "team + saved lineup" pickers. State lives entirely in the URL: a
 * change pushes new query params (soft navigation), the server re-renders with
 * the newly-selected team's saved lineups, and the comparison below updates.
 * Changing a team clears that side's lineup id (its old lineup belongs to the
 * old team). No local state — the selects are controlled off the URL, so a
 * shared/refreshed link shows exactly the same picks.
 */
export function CompareControls({
  teams,
  lineupsA,
  lineupsB,
  sel,
}: {
  teams: TeamSummary[];
  lineupsA: SavedLineup[];
  lineupsB: SavedLineup[];
  sel: { a: string; al: string; b: string; bl: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function apply(updates: Record<string, string>) {
    const params = new URLSearchParams(search?.toString() ?? "");
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const selCls =
    "h-8 w-full rounded-token border border-border bg-surface px-2 text-[12.5px] text-foreground";

  function Side({
    label,
    teamKey,
    lineupKey,
    team,
    lineup,
    lineups,
  }: {
    label: string;
    teamKey: "a" | "b";
    lineupKey: "al" | "bl";
    team: string;
    lineup: string;
    lineups: SavedLineup[];
  }) {
    return (
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-[11px] text-muted">{label}</span>
        <select
          aria-label={`${label}队伍`}
          value={team}
          onChange={(e) => apply({ [teamKey]: e.target.value, [lineupKey]: "" })}
          className={selCls}
        >
          <option value="">选一支队…</option>
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.display_name ? `${t.code} ${t.display_name}` : t.code}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}阵容`}
          value={lineup}
          disabled={team === "" || lineups.length === 0}
          onChange={(e) => apply({ [lineupKey]: e.target.value })}
          className={selCls}
        >
          <option value="">
            {team === ""
              ? "先选队伍"
              : lineups.length === 0
                ? "该队暂无已存阵容"
                : "选一套阵容…"}
          </option>
          {lineups.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-none gap-3 border-b border-border bg-surface-muted px-5 py-3">
      <Side label="我方" teamKey="a" lineupKey="al" team={sel.a} lineup={sel.al} lineups={lineupsA} />
      <Side label="对手" teamKey="b" lineupKey="bl" team={sel.b} lineup={sel.bl} lineups={lineupsB} />
    </div>
  );
}
