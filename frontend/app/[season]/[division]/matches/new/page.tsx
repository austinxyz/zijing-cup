import { redirect } from "next/navigation";

import {
  getDivisionRules,
  getDivisionTeams,
  getSavedLineups,
  getTeamRosterKeys,
  type LineupPlayer,
  type SavedLineup,
} from "@/lib/api";
import { canEdit as canEditCompetition } from "@/lib/admin";

import { MatchEntryForm } from "../MatchEntryForm";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
}

/**
 * 录入比赛：管理员专用。非管理员直接 redirect（这是纯写入页，没有只读视图——
 * 不像列表页那样留在原地给锁定态）。预取全组各队名单 + 已存阵容，交给客户端表单。
 */
export default async function NewMatchPage({ params }: PageProps) {
  const { season, division } = await params;

  if (!(await canEditCompetition(season, division))) {
    redirect(`/${season}/${division}/matches`);
  }

  const [teams, rules] = await Promise.all([
    getDivisionTeams(season, division),
    getDivisionRules(season, division),
  ]);
  const teamList = teams ?? [];

  // Prefetch every team's roster + saved lineups in parallel (a division holds
  // ~20 teams; each roster call is the cheap no-search path). The client form
  // needs both sides' players and the prefill source without a client fetch.
  const rosterEntries = await Promise.all(
    teamList.map(async (t) => [t.code, await getTeamRosterKeys(season, division, t.code)] as const),
  );
  const savedEntries = await Promise.all(
    teamList.map(async (t) => [t.code, await getSavedLineups(season, division, t.code)] as const),
  );

  const rostersByTeam: Record<string, LineupPlayer[]> = {};
  for (const [code, roster] of rosterEntries) {
    rostersByTeam[code] = roster ?? [];
  }
  const savedByTeam: Record<string, SavedLineup[]> = {};
  for (const [code, saved] of savedEntries) {
    savedByTeam[code] = saved;
  }

  const lineOrder = [...(rules?.lines ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({ code: l.code, kind: l.kind, points: l.points }));

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <h1 className="text-base font-semibold text-foreground">录入比赛</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          {rules?.division.display_name ?? division} · 逐线录双方上场与输赢，整场自动算分
        </span>
      </div>
      <MatchEntryForm
        season={season}
        division={division}
        teams={teamList.map((t) => ({ code: t.code, display_name: t.display_name }))}
        lineOrder={lineOrder}
        scoringMode={rules?.division.scoring_mode ?? "match_count"}
        rostersByTeam={rostersByTeam}
        savedByTeam={savedByTeam}
      />
    </main>
  );
}
