import { notFound } from "next/navigation";

import { getPlayer } from "@/lib/api";
import { playerName } from "@/lib/name";
import { SplitForm } from "./SplitForm";

interface PageProps {
  params: Promise<{ season: string; division: string; id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function numbers(value: string | string[] | undefined): number[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(Number).filter((n) => Number.isFinite(n));
}

export default async function SplitPage({ params, searchParams }: PageProps) {
  const { season, division, id } = await params;
  const query = searchParams ? await searchParams : {};

  const player = await getPlayer(id);
  if (player === null) notFound();

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <h1 className="text-base font-semibold text-foreground">
          拆分 · {playerName(player)}
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          player #{player.id} · 逐行决定每条记录跟谁走
        </span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        {/* danger, not the warning tier used for 未裁决: one says "look at
            this", the other says "this cannot be taken back". Same colour for
            both would flatten the difference. */}
        <div
          role="alert"
          className="flex-none rounded-token border border-danger-border bg-danger-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-danger"
        >
          <strong>拆分不可撤销。</strong>
          本次没有操作历史，拆错了只能手工把记录搬回去。执行前请确认下面每一行的归属。
        </div>

        <SplitForm
          player={player}
          selectedMemberships={numbers(query.m)}
          selectedSeasons={numbers(query.s)}
          season={season}
          division={division}
        />
      </div>
    </main>
  );
}
