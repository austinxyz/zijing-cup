import Link from "next/link";
import { notFound } from "next/navigation";

import { isSignedIn } from "@/lib/admin";
import { getTeamRoster } from "@/lib/api";
import { TeamEditPanel } from "./TeamEditPanel";

interface PageProps {
  params: Promise<{ season: string; division: string; code: string }>;
}

export default async function TeamRosterPage({ params }: PageProps) {
  const { season, division, code } = await params;

  const roster = await getTeamRoster(season, division, code);
  // Not an empty table: that would say "this team has no players", which is a
  // different and false claim about a team that does not exist.
  if (roster === null) notFound();

  // Only decides whether to offer the controls. The write endpoint refuses an
  // unauthenticated caller on its own; this keeps the page from showing a
  // button that cannot work.
  const canEdit = await isSignedIn();

  const men = roster.players.filter((p) => p.gender === "M").length;
  const women = roster.players.filter((p) => p.gender === "F").length;

  return (
    <>
      {/* Narrow viewport only: the list and the roster are separate screens
          there, so this is the way back to pick another team. Desktop keeps
          both columns, so it is md:hidden — in the DOM, hidden by the
          breakpoint. */}
      <Link
        href={`/${season}/${division}/teams`}
        className="flex flex-none items-center gap-1.5 border-b border-border bg-surface px-4 py-2.5 text-[13px] text-primary no-underline md:hidden"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 3.5L5.5 8L10 12.5" />
        </svg>
        球队列表
      </Link>
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
        <div className="flex flex-none items-center gap-3">
          {canEdit ? (
            <Link
              href={`/${season}/${division}/teams/${encodeURIComponent(code)}/utr`}
              className="rounded-token border border-border bg-surface px-2.5 py-1 text-[12px] text-foreground no-underline"
            >
              当前 UTR 批量导入
            </Link>
          ) : null}
          {/* The number in the table is not a live rating. A captain checking
              it against the UTR site needs to know which one this is. */}
          <span className="font-mono text-[11.5px] text-muted-foreground">
            参赛 UTR · 赛前冻结
          </span>
        </div>
      </div>

      {/* The edit panel owns its own scroll: the team header above stays in
          view; the toggle/caps bar and the Save bar pin, the table scrolls. */}
      <TeamEditPanel
        roster={roster}
        canEdit={canEdit}
        season={season}
        division={division}
        teamCode={code}
      />
    </>
  );
}
