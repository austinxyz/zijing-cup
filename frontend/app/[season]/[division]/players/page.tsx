import Link from "next/link";

import { getPlayers, getPlayersPage } from "@/lib/api";
import { PlayerTable } from "./PlayerTable";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Every player the system knows, across seasons.
 *
 * Not scoped to the season in the URL by default: a player is a person, and
 * the reason this page exists is to maintain people who may not be on any team
 * yet. The season filter is offered, not imposed.
 */
export default async function PlayersPage({ params, searchParams }: PageProps) {
  const { season, division } = await params;
  const query = await searchParams;

  const search = one(query.q);
  const seasonFilter = one(query.season);

  // Two calls on purpose. The list is capped, so counting unresolved rows
  // inside it would report however many happened to land on this page — 7 of
  // 17, with nothing on screen to say the number was partial. The second call
  // asks the server for the real count and brings back no rows.
  const [players, unresolvedPage] = await Promise.all([
    getPlayers({
      query: search || undefined,
      season: seasonFilter || undefined,
    }),
    getPlayersPage({
      query: search || undefined,
      season: seasonFilter || undefined,
      unresolved: true,
      limit: 1,
    }),
  ]);

  const unresolved = unresolvedPage.total;
  // The backend caps a page at 200. Saying so is the difference between "this
  // is the roster" and "this is the first 200 of it".
  const truncated = players.length >= 200;

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-base font-semibold text-foreground">队员</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {truncated
              ? `只显示前 ${players.length} 人 · 缩小搜索范围可以看到其余的`
              : `共 ${players.length} 人`}{" "}
            · 跨赛季维护，队员可以不属于任何队伍
          </span>
        </div>
        <div className="flex flex-none items-center gap-2">
          {/* The queue lives with the work, not in the global nav: it is this
              page's backlog, not a destination of its own. */}
          <Link
            href={`/${season}/${division}/players/unresolved`}
            className="flex h-8 items-center gap-1.5 rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground no-underline"
          >
            未裁决
            <span className="rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] text-[#8a6508]">
              {unresolved}
            </span>
          </Link>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 px-5 py-4">
        <form method="get" className="flex flex-none gap-2">
          <input
            type="search"
            name="q"
            aria-label="搜索队员"
            placeholder="搜索姓名或 UTR 链接…"
            defaultValue={search}
            className="h-8 flex-1 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
          />
          <button
            type="submit"
            className="flex h-8 items-center rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground"
          >
            搜索
          </button>
        </form>

        {players.length === 0 ? (
          // Not an empty table: a table with no rows reads as a broken page,
          // and this is an ordinary answer to a search.
          <div className="rounded-token border border-border bg-surface px-4 py-6 text-center text-[12.5px] text-muted">
            {search ? `没有匹配的队员：${search}` : "还没有任何队员。"}
          </div>
        ) : (
          // The list scrolls inside its own box. The shell is h-screen
          // overflow-hidden, so a long list without this is cut off silently,
          // with no scrollbar to say there is more.
          <div className="flex-1 min-h-0 overflow-y-auto rounded-token border border-border bg-surface">
            <PlayerTable players={players} season={season} division={division} />
          </div>
        )}
      </div>
    </main>
  );
}
