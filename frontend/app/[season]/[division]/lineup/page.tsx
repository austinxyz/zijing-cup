import Link from "next/link";
import { notFound } from "next/navigation";

import { getDivisionTeams } from "@/lib/api";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
}

/**
 * Which team's lineup.
 *
 * A lineup only exists for one team at a time, so the sidebar's 阵容 needs
 * somewhere to land when the URL does not already name one. A picker rather
 * than a redirect to some arbitrary first team: the app would otherwise open
 * a team the captain did not choose and show it as though they had.
 */
export default async function LineupIndexPage({ params }: PageProps) {
  const { season, division } = await params;

  const teams = await getDivisionTeams(season, division);
  if (teams === null) notFound();

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <span className="text-base font-semibold text-foreground">阵容</span>
        <span className="text-[12.5px] text-muted">
          先选一支球队，再锁定搭档、排除本场不能上的队员。
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <ul className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <li key={team.code}>
              <Link
                href={`/${season}/${division}/lineup/${encodeURIComponent(team.code)}`}
                className="flex flex-col gap-0.5 rounded-token border border-border bg-surface px-3 py-2 no-underline"
              >
                <span className="text-[13px] font-medium text-foreground">
                  {team.code}
                  {team.display_name ? (
                    <span className="ml-2 text-[12px] font-normal text-muted">
                      {team.display_name}
                    </span>
                  ) : null}
                </span>
                {/* Five lines need three women on court. Which teams sit near
                    that floor decides whether a search is worth running. */}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {team.player_count} 人 · {team.men_count} 男 · {team.women_count} 女
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
