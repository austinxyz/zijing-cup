import Link from "next/link";

import {
  getPlayer,
  getPlayerNotes,
  getPlayers,
  getPlayersPage,
  getSeasons,
} from "@/lib/api";
import { canEdit as canEditCompetition } from "@/lib/admin";
import { PlayerEditProvider } from "./PlayerEditContext";
import { PlayerEditHeaderControl } from "./PlayerEditHeaderControl";
import { PlayerSearch } from "./PlayerSearch";
import { PlayerResultList } from "./PlayerResultList";
import { PlayerDetail } from "./PlayerDetail";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * The player workbench: a person register maintained across seasons, laid out
 * as a search-and-detail workbench. Left column searches (name / gender / team /
 * year) and lists matches; the right pane shows the selected player (`?sel`).
 * Not scoped to the URL's season by default — a player is a person, and this
 * page exists to maintain people who may not be on any team yet.
 *
 * Read-only for everyone (the section no longer gates on canEdit); editing is
 * unlocked per competition and its write controls appear only in edit mode.
 */
export default async function PlayersPage({ params, searchParams }: PageProps) {
  const { season, division } = await params;
  const query = await searchParams;

  const filters = {
    q: one(query.q),
    gender: one(query.gender),
    team: one(query.team),
    year: one(query.year),
  };
  const sel = one(query.sel);
  const canEdit = await canEditCompetition(season, division);

  let years: number[] = [];
  try {
    const seasons = await getSeasons();
    years = seasons.map((s) => s.year).sort((a, b) => b - a);
  } catch {
    years = [];
  }

  // Left list + honest unresolved count + (only when selected) the detail.
  const [players, unresolvedPage, selected, notes] = await Promise.all([
    getPlayers({
      query: filters.q || undefined,
      gender: filters.gender || undefined,
      team: filters.team || undefined,
      year: filters.year || undefined,
    }),
    getPlayersPage({
      query: filters.q || undefined,
      gender: filters.gender || undefined,
      team: filters.team || undefined,
      year: filters.year || undefined,
      unresolved: true,
      limit: 1,
    }),
    sel ? getPlayer(sel) : Promise.resolve(null),
    // Notes are confidential: fetched only for an unlocked viewer, and only for
    // the selected player. `null` (not []) means "locked" — the detail shows
    // the 机密 placeholder rather than an empty timeline.
    sel && canEdit ? getPlayerNotes(sel) : Promise.resolve(null),
  ]);

  const unresolved = unresolvedPage.total;
  const truncated = players.length >= 200;

  return (
    <PlayerEditProvider canEdit={canEdit}>
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="text-base font-semibold text-foreground">队员</h1>
            <span className="font-mono text-[11px] text-muted-foreground">
              {truncated ? `只显示前 ${players.length} 人 · 缩小搜索范围` : `共 ${players.length} 人`}{" "}
              · 跨赛季维护
            </span>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`/${season}/${division}/players/unresolved`}
              className="flex h-8 items-center gap-1.5 rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground no-underline"
            >
              未裁决
              <span className="rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] text-warning">
                {unresolved}
              </span>
            </Link>
            <PlayerEditHeaderControl season={season} division={division} />
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left: search + results. Own scroll container (the shell is
              h-screen overflow-hidden). On mobile it hides once a player is
              selected, so the detail gets the screen. */}
          <div
            className={
              "flex min-h-0 flex-none flex-col border-b border-border bg-surface md:w-[300px] md:border-b-0 md:border-r " +
              (sel ? "hidden md:flex" : "flex")
            }
          >
            <PlayerSearch {...filters} years={years} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {players.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12.5px] text-muted">
                  {filters.q || filters.gender || filters.team || filters.year
                    ? "没有匹配的队员"
                    : "还没有任何队员"}
                </div>
              ) : (
                <PlayerResultList
                  players={players}
                  filters={filters}
                  selectedId={sel}
                />
              )}
            </div>
          </div>

          {/* Right: detail for the selected player, or an empty state. Keyed by
              sel so the (non-controlled) edit form remounts per player and never
              shows the previous person's values. */}
          <div
            className={
              "min-h-0 flex-1 overflow-y-auto px-5 py-4 " +
              (sel ? "block" : "hidden md:block")
            }
          >
            {sel ? (
              <Link
                href={(() => {
                  const p = new URLSearchParams();
                  if (filters.q) p.set("q", filters.q);
                  if (filters.gender) p.set("gender", filters.gender);
                  if (filters.team) p.set("team", filters.team);
                  if (filters.year) p.set("year", filters.year);
                  const s = p.toString();
                  return s ? `?${s}` : "?";
                })()}
                className="mb-2 inline-block text-[12px] text-primary no-underline md:hidden"
              >
                ← 队员
              </Link>
            ) : null}
            {selected ? (
              <PlayerDetail
                key={sel}
                player={selected}
                season={season}
                division={division}
                notes={notes}
              />
            ) : sel ? (
              <div className="flex h-full items-center justify-center text-[12.5px] text-muted">
                找不到这名队员（可能已被合并或删除）。
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted">
                从左边选一个队员查看详情。
              </div>
            )}
          </div>
        </div>
      </main>
    </PlayerEditProvider>
  );
}
