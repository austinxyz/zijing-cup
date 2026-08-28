import { notFound } from "next/navigation";

import { getTeamRoster } from "@/lib/api";
import { RosterTable } from "./RosterTable";

interface PageProps {
  params: Promise<{ season: string; division: string; code: string }>;
}

export default async function TeamRosterPage({ params }: PageProps) {
  const { season, division, code } = await params;

  const roster = await getTeamRoster(season, division, code);
  // Not an empty table: that would say "this team has no players", which is a
  // different and false claim about a team that does not exist.
  if (roster === null) notFound();

  const men = roster.players.filter((p) => p.gender === "M").length;
  const women = roster.players.filter((p) => p.gender === "F").length;

  return (
    <>
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-[22px] py-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-baseline gap-2.5">
            {/* The code is the identity everyone uses; the Chinese name, when
                a human has given one, is the friendlier second label. */}
            <span className="text-base font-semibold leading-snug text-foreground">
              {roster.team.code}
            </span>
            {roster.team.display_name ? (
              <span className="text-[13px] text-muted">
                {roster.team.display_name}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted">
              {roster.players.length} 人
            </span>
            <span className="h-[3px] w-[3px] rounded-full bg-[#cfc9bc]" />
            <span className="font-mono text-xs text-muted">
              {men} 男 · {women} 女
            </span>
          </div>
        </div>
        {/* The number in the table is not a live rating. A captain checking it
            against the UTR site needs to know which one this is. */}
        <span className="flex-none font-mono text-[11.5px] text-muted-foreground">
          参赛 UTR · 赛前冻结
        </span>
      </div>

      <RosterTable players={roster.players} />
    </>
  );
}
