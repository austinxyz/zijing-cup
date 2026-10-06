import { getDivisionTeams, getMatchRecords } from "@/lib/api";
import { canEdit as canEditCompetition, isSignedIn } from "@/lib/admin";
import { EditModeToggle } from "@/app/[season]/[division]/lineup/[code]/EditModeToggle";

import { MatchHistory } from "./MatchHistory";
import { deleteMatch } from "./actions";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
}

/**
 * 比赛历史：录过的对局列表，可按队筛、点开看逐线详情。比赛结果是排阵情报，
 * 属管理员机密，整页按 canEdit gate——未解锁就地渲染锁定态 + 解锁入口，不取数。
 */
export default async function MatchesPage({ params }: PageProps) {
  const { season, division } = await params;

  if (!(await canEditCompetition(season, division))) {
    const signedIn = await isSignedIn();
    return (
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
          <h1 className="text-base font-semibold text-foreground">比赛历史</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            录过的对局 · 逐线输赢，作排阵参考
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className="max-w-sm text-[13px] text-muted">
            比赛记录是排阵情报，属管理员机密。解锁本比赛后才能查看。
          </p>
          <EditModeToggle signedIn={signedIn} season={season} division={division} />
        </div>
      </main>
    );
  }

  const [teams, matches] = await Promise.all([
    getDivisionTeams(season, division),
    getMatchRecords(season, division),
  ]);

  const teamRefs = (teams ?? []).map((t) => ({
    code: t.code,
    display_name: t.display_name,
  }));

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <h1 className="text-base font-semibold text-foreground">比赛历史</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          录过的对局 · 逐线输赢，作排阵参考
        </span>
      </div>
      <MatchHistory
        season={season}
        division={division}
        teams={teamRefs}
        matches={matches}
        canEdit
        onDelete={deleteMatch.bind(null, season, division)}
      />
    </main>
  );
}
