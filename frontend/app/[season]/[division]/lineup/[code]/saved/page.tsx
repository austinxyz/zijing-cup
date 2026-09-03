import { notFound } from "next/navigation";

import { getSavedLineups, getTeamLineups } from "@/lib/api";
import { isSignedIn } from "@/lib/admin";
import { deleteSavedLineup } from "../actions";
import { SavedLineups } from "../SavedLineups";

interface PageProps {
  params: Promise<{ season: string; division: string; code: string }>;
}

/**
 * A team's saved lineups, each re-judged against the current participation
 * UTRs. Separate from the search page: the search asks "what can this team
 * field now"; this asks "do the lineups I saved still hold".
 */
export default async function SavedLineupsPage({ params }: PageProps) {
  const { season, division, code } = await params;

  // The roster (with current UTRs) is what the saved lineups are read against:
  // names for display, and which keys have left the team. null means no such
  // team — a saved-lineups page for a team that does not exist is a 404, the
  // same answer the search page gives.
  const [search, saved, canEdit] = await Promise.all([
    getTeamLineups(season, division, code),
    getSavedLineups(season, division, code),
    isSignedIn(),
  ]);
  if (search === null) notFound();

  const basePath = `/${season}/${division}/lineup/${encodeURIComponent(code)}`;
  const deleteAction = deleteSavedLineup.bind(null, season, division, code);

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-baseline gap-2.5">
            <span className="text-base font-semibold text-foreground">{code}</span>
            <span className="text-[12.5px] text-muted-foreground">已存阵容</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            每套按当前参赛 UTR 重判：仍合法 / UTR 动了仍合法 / 已非法 / 有人离队。
          </span>
        </div>
        <a
          href={basePath}
          className="flex-none rounded-token border border-border bg-surface-muted px-2.5 py-1 text-[12px] text-foreground"
        >
          ← 回排阵
        </a>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        <SavedLineups
          saved={saved}
          roster={search.roster}
          canEdit={canEdit}
          basePath={basePath}
          deleteAction={canEdit ? deleteAction : undefined}
        />
      </div>
    </main>
  );
}
