import Link from "next/link";

import { cn } from "@/lib/cn";
import type { SeasonIndex } from "@/lib/api";
import { navItems, type NavSection } from "./nav";
import { switcherOptions } from "./switcher";

interface TopNavProps {
  season: string;
  division: string;
  divisionName: string;
  seasons: SeasonIndex[];
  /** Derived from the route, never held as state. */
  section?: NavSection;
  /** The team in scope, so 阵容 opens that roster's lineup directly. */
  teamCode?: string;
  signedIn?: boolean;
}

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
 * The narrow-viewport form of the app shell's navigation.
 *
 * Same nav data and season switcher as the sidebar — only the arrangement
 * differs: a dark top bar over a row of tabs. It drops the one item flagged
 * `admin` (队员管理), which has no narrow layout and must not be pushed to the
 * most prominent spot. Colours come from the sidebar tokens: this is page
 * chrome, not content.
 */
export function TopNav({
  season,
  division,
  divisionName,
  seasons,
  section = "rules",
  teamCode,
}: TopNavProps) {
  const options = switcherOptions(seasons, season, division);
  const tabs = navItems(season, division, teamCode).filter(
    (item) => !item.admin,
  );

  return (
    <div
      data-testid="top-bar"
      className="flex flex-none flex-col bg-sidebar text-sidebar-foreground md:hidden"
    >
      <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[5px] bg-primary font-mono text-[11.5px] font-semibold leading-none text-primary-foreground">
            紫
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold leading-tight text-sidebar-foreground-bright">
              紫荆杯
            </div>
          </div>
        </div>

        {/* Native <details>, same as the sidebar: collapsed it names the
            current pair, opened it lists them all. No client JS. Its own well
            colour — borrowing the content-area background put a near-white
            label on a near-white pill (1.05:1). */}
        <details role="group" aria-label="赛季与组别" className="group relative">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-token border border-[#33322c] bg-sidebar-well px-2.5 text-[12px] font-medium text-sidebar-foreground-bright [&::-webkit-details-marker]:hidden">
            <span className="whitespace-nowrap">
              {season} · {divisionName}
            </span>
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="flex-none text-sidebar-foreground-dim transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
          </summary>

          <ul className="absolute right-0 z-20 mt-1 flex min-w-[160px] flex-col gap-px rounded-token border border-sidebar-border bg-sidebar-well p-1 shadow-lg">
            {options.map((option) =>
              option.current ? (
                <li key={option.key}>
                  <span
                    aria-current="true"
                    className="flex h-9 items-center rounded-token border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 pr-2.5 text-[12.5px] font-medium text-sidebar-foreground-bright"
                  >
                    {option.label}
                  </span>
                </li>
              ) : (
                <li key={option.key}>
                  <Link
                    href={option.href}
                    className="flex h-9 items-center rounded-token px-2.5 text-[12.5px] text-sidebar-foreground no-underline hover:bg-sidebar-active"
                  >
                    {option.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </details>
      </div>

      <nav
        aria-label="主导航"
        className="flex border-t border-sidebar-border px-1"
      >
        {tabs.map((item) =>
          item.pending ? (
            <div
              key={item.key}
              data-tab
              aria-disabled="true"
              className="flex h-11 flex-1 flex-col items-center justify-center gap-0.5 text-sidebar-foreground-dim"
            >
              <span className="flex items-center gap-1 text-[12.5px]">
                {item.label}
              </span>
              <span className="rounded-token border border-sidebar-border px-1 font-mono text-[8.5px] leading-none text-sidebar-foreground-dim">
                未开放
              </span>
            </div>
          ) : (
            <Link
              key={item.key}
              data-tab
              href={item.href!}
              aria-current={section === item.key ? "page" : undefined}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-[12.5px] no-underline",
                section === item.key
                  ? "border-b-[#c9502f] font-medium text-sidebar-foreground-bright"
                  : "border-b-transparent text-sidebar-foreground",
              )}
            >
              <NavIcon path={item.icon} />
              <span>{item.label}</span>
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
