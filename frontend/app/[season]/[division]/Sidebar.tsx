import Link from "next/link";

import { cn } from "@/lib/cn";
import type { SeasonIndex } from "@/lib/api";

/** Which nav destination the current URL is under. */
export type NavSection = "teams" | "lineup" | "rules";

interface SidebarProps {
  season: string;
  division: string;
  /** Display name from the database (金组 / 银组); the URL keeps the code. */
  divisionName: string;
  seasons: SeasonIndex[];
  /** Derived from the route, never held as state. Defaults to the rules page
   *  because that is the division's index route. */
  section?: NavSection;
  /** The team the URL is on, when it is on one. 阵容 then opens that team's
   *  lineup directly instead of sending you through a picker to choose the
   *  team already on screen. */
  teamCode?: string;
}

const GRID_ICON =
  "M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6zM9.2 9.2h4.2v4.2H9.2z";
const CHART_ICON = "M2.6 13.4h10.8M4.8 11V7.2M8 11V3.4M11.2 11V5.8";
const SWAP_ICON =
  "M2.6 5.2h9.4M9.4 2.6L12 5.2 9.4 7.8M13.4 10.8H4M6.6 8.2L4 10.8l2.6 2.6";
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

/**
 * A destination that exists.
 *
 * It stays a link even when it is the current section, unlike the season
 * switcher's current entry: from a team's roster, this is how you get back to
 * the list, so it is not a dead click.
 */
function NavLink({
  label,
  icon,
  href,
  current,
}: {
  label: string;
  icon: string;
  href: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-[34px] items-center gap-[9px] rounded-token px-2.5 no-underline",
        current
          ? "border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 text-[13px] font-medium text-sidebar-foreground-bright"
          : "text-[13px] text-sidebar-foreground hover:bg-sidebar-active",
      )}
    >
      <NavIcon path={icon} />
      <span>{label}</span>
    </Link>
  );
}


export function Sidebar({
  season,
  division,
  divisionName,
  seasons,
  section = "rules",
  teamCode,
}: SidebarProps) {
  // EVERY (season, division) pair, including the one already open — which is
  // marked rather than omitted. Hiding the current pair made the option set
  // change membership on every switch: you never saw all four at once, and
  // the list appeared to rewrite itself under you.
  //
  // These are links, not client state. The URL decides which rules are in
  // force, so a selection held in React would be a second source of truth
  // that could disagree with the address bar.
  const options = seasons.flatMap((entry) =>
    entry.divisions.map((item) => ({
      key: `${entry.year}-${item.code}`,
      href: `/${entry.year}/${item.code}/rules`,
      label: `${entry.year} · ${item.display_name}`,
      current: String(entry.year) === season && item.code === division,
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

        {/* A native <details>: collapsed it reads as one control naming the
            current season and division, opened it shows the full list. No
            client JS, and the closed state keeps the sidebar compact. */}
        <details role="group" aria-label="赛季与组别" className="group">
          <summary className="flex h-[34px] cursor-pointer list-none items-center justify-between gap-2 rounded-token border border-[#33322c] bg-background px-2.5 text-[12.5px] font-medium text-sidebar-foreground-bright [&::-webkit-details-marker]:hidden">
            <span>
              {season} · {divisionName}
            </span>
            <svg
              viewBox="0 0 16 16"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none text-sidebar-foreground-dim transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
          </summary>

          <ul className="mt-1 flex flex-col gap-px">
            {options.map((option) =>
              option.current ? (
                <li key={option.key}>
                  {/* Present but not a link: a "switch to" entry pointing at
                      the page you are already on is a dead click. */}
                  <span
                    aria-current="true"
                    className="flex h-8 items-center rounded-token border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 pr-2.5 text-[12.5px] font-medium text-sidebar-foreground-bright"
                  >
                    {option.label}
                  </span>
                </li>
              ) : (
                <li key={option.key}>
                  <Link
                    href={option.href}
                    className="flex h-8 items-center rounded-token px-2.5 text-[12.5px] text-sidebar-foreground no-underline hover:bg-sidebar-active"
                  >
                    {option.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </details>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        <NavLink
          label="队伍"
          icon={GRID_ICON}
          href={`/${season}/${division}/teams`}
          current={section === "teams"}
        />
        <NavLink
          label="阵容"
          icon={CHART_ICON}
          href={
            teamCode
              ? `/${season}/${division}/lineup/${encodeURIComponent(teamCode)}`
              : `/${season}/${division}/lineup`
          }
          current={section === "lineup"}
        />
        {/* Its own row, and still closed. Folding it into 阵容 under the old
            name 分析 would claim this app can already compare opponents. */}
        <PendingNavItem label="对手对比" icon={SWAP_ICON} />
        <NavLink
          label="赛制规则"
          icon={DOC_ICON}
          href={`/${season}/${division}/rules`}
          current={section === "rules"}
        />
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
