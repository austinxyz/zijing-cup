import Link from "next/link";

import type { Player } from "@/lib/api";
import { playerName } from "@/lib/name";

/** The participation UTR to show in a row: the filtered year's value when a year
 *  filter is set, otherwise the most recent (season_utrs is year-desc). */
function latestUtr(player: Player, year: string): string | null {
  if (year) {
    const hit = player.season_utrs.find((u) => String(u.season_year) === year);
    if (hit) return hit.value;
  }
  return player.season_utrs[0]?.value ?? null;
}

/** The most recent team, plus a "+N" when the player is on more than one. */
function teamSummary(player: Player): string {
  if (player.memberships.length === 0) return "无队伍";
  const latest = [...player.memberships].sort(
    (a, b) => b.season_year - a.season_year,
  )[0];
  const extra = player.memberships.length - 1;
  return extra > 0 ? `${latest.team_code} +${extra}` : latest.team_code;
}

/**
 * The compact result list. Each row is a Link that keeps the current search and
 * adds `?sel=<id>` (soft navigation — the left column stays put, the right pane
 * updates). Only the four columns the workbench needs: name, gender, latest
 * participation UTR, team.
 */
export function PlayerResultList({
  players,
  filters,
  selectedId,
}: {
  players: Player[];
  /** Current search conditions, carried into each row's href so selecting does
   *  not drop the search. */
  filters: { q: string; gender: string; team: string; year: string };
  selectedId: string;
}) {
  function hrefFor(id: number): string {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.gender) params.set("gender", filters.gender);
    if (filters.team) params.set("team", filters.team);
    if (filters.year) params.set("year", filters.year);
    params.set("sel", String(id));
    return `?${params.toString()}`;
  }

  return (
    <ul className="flex flex-col">
      {players.map((player) => {
        const utr = latestUtr(player, filters.year);
        const selected = String(player.id) === selectedId;
        const g = player.gender;
        return (
          <li key={player.id}>
            <Link
              href={hrefFor(player.id)}
              aria-current={selected ? "true" : undefined}
              className={
                "flex flex-col gap-0.5 border-b border-border px-3 py-2.5 no-underline " +
                (selected
                  ? "border-l-[3px] border-l-primary bg-[#f4f7fc] pl-[9px]"
                  : "hover:bg-surface-muted")
              }
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-foreground">
                  {playerName(player)}
                </span>
                <span
                  className={
                    "text-[12px] font-bold " +
                    (g === "M"
                      ? "text-[#1f5fd0]"
                      : g === "F"
                        ? "text-[#ab237f]"
                        : "text-muted-foreground")
                  }
                >
                  {g === "M" ? "♂" : g === "F" ? "♀" : "·"}
                </span>
              </span>
              <span className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span>
                  最新参赛{" "}
                  <span className="font-mono">{utr ?? "无"}</span>
                </span>
                <span>{teamSummary(player)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
