import Link from "next/link";

import { cn } from "@/lib/cn";
import type { SeasonIndex } from "@/lib/api";

interface SidebarProps {
  season: string;
  division: string;
  /** Display name from the database (金组 / 银组); the URL keeps the code. */
  divisionName: string;
  seasons: SeasonIndex[];
}

const GRID_ICON =
  "M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6zM9.2 9.2h4.2v4.2H9.2z";
const CHART_ICON = "M2.6 13.4h10.8M4.8 11V7.2M8 11V3.4M11.2 11V5.8";
const DOC_ICON = "M4 2.4h8v11.2H4zM6.4 5.4h3.2M6.4 8h3.2M6.4 10.6h2";

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none opacity-85"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * A nav destination that does not exist yet.
 *
 * Rendered as a disabled row rather than a link. The sibling project shipped
 * a sidebar entry that looked clickable and did nothing, and it read as a
 * broken app rather than an unfinished one — saying "未开放" costs nothing and
 * is honest.
 */
function PendingNavItem({ label, icon }: { label: string; icon: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex h-[34px] items-center justify-between gap-2 rounded-token px-2.5 text-[13px] text-sidebar-foreground-dim"
    >
      <span className="flex min-w-0 items-center gap-[9px] opacity-45">
        <NavIcon path={icon} />
        <span>{label}</span>
      </span>
      <span className="flex-none rounded-token border border-sidebar-border px-1.5 font-mono text-[9.5px] leading-relaxed text-sidebar-foreground-dim">
        未开放
      </span>
    </div>
  );
}

export function Sidebar({
  season,
  division,
  divisionName,
  seasons,
}: SidebarProps) {
  // Every (season, division) pair except the one already open. The switcher
  // is a list of links, not client state: the URL is what decides which rules
  // are in force, so a selection that lived in React would be a second,
  // disagreeing source of truth.
  const options = seasons.flatMap((entry) =>
    entry.divisions
      .filter(
        (item) => !(String(entry.year) === season && item.code === division),
      )
      .map((item) => ({
        key: `${entry.year}-${item.code}`,
        href: `/${entry.year}/${item.code}/rules`,
        label: `${entry.year} · ${item.display_name}`,
      })),
  );

  return (
    <aside className="flex w-[216px] flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-2.5 border-b border-sidebar-border px-4 pb-4 pt-[18px]">
        <div className="flex flex-col gap-[3px]">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 flex-none items-center justify-center rounded-[5px] bg-primary font-mono text-[11px] font-semibold leading-none text-primary-foreground">
              紫
            </div>
            <div className="font-sans text-sm font-semibold leading-tight tracking-wide text-sidebar-foreground-bright">
              紫荆杯
            </div>
          </div>
          <div className="pl-7 font-mono text-[10.5px] leading-tight tracking-wide text-sidebar-foreground-dim">
            TEAM ANALYSIS
          </div>
        </div>

        <div
          role="group"
          aria-label="赛季与组别"
          className="flex flex-col gap-1"
        >
          <div className="flex h-[34px] items-center justify-between gap-2 rounded-token border border-[#33322c] bg-background px-2.5 text-[12.5px] font-medium text-sidebar-foreground-bright">
            <span>
              {season} · {divisionName}
            </span>
          </div>
          {options.length > 0 && (
            <ul className="flex flex-col gap-px">
              {options.map((option) => (
                <li key={option.key}>
                  <Link
                    href={option.href}
                    className="flex h-8 items-center rounded-token px-2.5 text-[12.5px] text-sidebar-foreground no-underline hover:bg-sidebar-active"
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        <PendingNavItem label="队伍" icon={GRID_ICON} />
        <PendingNavItem label="分析" icon={CHART_ICON} />
        <div
          aria-current="page"
          className={cn(
            "flex h-[34px] items-center justify-between gap-2 rounded-token border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 pr-2.5",
            "text-[13px] font-medium text-sidebar-foreground-bright",
          )}
        >
          <span className="flex min-w-0 items-center gap-[9px]">
            <NavIcon path={DOC_ICON} />
            <span>赛制规则</span>
          </span>
        </div>
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-3.5 py-2.5">
        <div className="font-mono text-[11px] leading-relaxed text-sidebar-foreground/80">
          规则来源
        </div>
        <div className="font-mono text-[10.5px] leading-relaxed text-sidebar-foreground-dim">
          seed · {season} 官方规则
        </div>
      </div>
    </aside>
  );
}
