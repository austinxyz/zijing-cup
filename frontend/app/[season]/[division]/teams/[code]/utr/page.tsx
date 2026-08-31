import Link from "next/link";
import { notFound } from "next/navigation";

import { getUtrSheet } from "@/lib/api";
import { UtrPanel } from "./UtrPanel";

interface PageProps {
  params: Promise<{ season: string; division: string; code: string }>;
}

export default async function UtrSheetPage({ params }: PageProps) {
  const { season, division, code } = await params;

  const rows = await getUtrSheet(season, division, code);
  // Not an empty sheet: "no such team" and "a team with nobody on it" are
  // different answers, and only one of them is true at a time.
  if (rows === null) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-baseline justify-between gap-2.5 border-b border-border bg-surface px-[22px] py-[11px]">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-semibold text-foreground">
            当前 UTR · {code}
          </span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {season} · {division} · {rows.length} 人
          </span>
        </div>
        <Link
          href={`/${season}/${division}/teams/${encodeURIComponent(code)}`}
          className="text-[12px] text-muted no-underline hover:text-foreground"
        >
          回名单
        </Link>
      </div>

      <UtrPanel
        rows={rows}
        season={season}
        division={division}
        teamCode={code}
      />
    </div>
  );
}
