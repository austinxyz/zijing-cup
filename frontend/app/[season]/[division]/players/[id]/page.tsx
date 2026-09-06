import Link from "next/link";
import { notFound } from "next/navigation";

import { getPlayer, type Player } from "@/lib/api";
import { canEdit as canEditCompetition } from "@/lib/admin";

import { PlayerDetail } from "../PlayerDetail";
import { PlayerEditProvider } from "../PlayerEditContext";
import { PlayerEditHeaderControl } from "../PlayerEditHeaderControl";

interface PageProps {
  params: Promise<{ season: string; division: string; id: string }>;
}

/**
 * Deep link to one player. The workbench index shows the same detail inline via
 * `?sel`; this route keeps a stable URL per player and is the parent of the
 * merge / split confirmation pages. Read-only unless this competition is
 * unlocked and edit mode is on — the shared `PlayerDetail` handles that.
 */
export default async function PlayerDetailPage({ params }: PageProps) {
  const { season, division, id } = await params;

  const player: Player | null = await getPlayer(id);
  if (player === null) notFound();

  const canEdit = await canEditCompetition(season, division);

  return (
    <PlayerEditProvider canEdit={canEdit}>
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
          <Link
            href={`/${season}/${division}/players`}
            className="text-[12px] text-primary no-underline"
          >
            ← 队员
          </Link>
          <PlayerEditHeaderControl season={season} division={division} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <PlayerDetail player={player} season={season} division={division} />
        </div>
      </main>
    </PlayerEditProvider>
  );
}
