import Link from "next/link";

import { cn } from "@/lib/cn";
import type { SeasonIndex } from "@/lib/api";
import { logout } from "@/app/login/actions";
import { navItems, type NavSection } from "./nav";

export type { NavSection };

interface SidebarProps {
  season: string;
  division: string;
  /** Display name from the database (金组 / 银组); the URL keeps the code. */
  divisionName: string;
  seasons: SeasonIndex[];
  /** Derived from the route, never held as state. Defaults to the rules page
   *  because that is the division's index route. `"admin"` is the /admin page,
   *  which is outside the competition nav — no nav item is current there, and
   *  the 比赛密码 link is marked instead. */
  section?: NavSection | "admin";
  /** The team the URL is on, when it is on one. 阵容 then opens that team's
   *  lineup directly instead of sending you through a picker to choose the
   *  team already on screen. */
  teamCode?: string;
  /** Whether an admin session is active. Read on the server; the sidebar shows
   *  an identity only when there really is one — a logged-out reader seeing
   *  one would misread who can change things. */
  signedIn?: boolean;
  /** Whether the session is the super admin (scope "*"). Gates the 比赛密码
   *  link — only super can set competition passwords; a scoped captain would
   *  reach only the notice at /admin, so the door is not shown to them. */
  isSuper?: boolean;
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
      <span className="flex min-w-0 items-center gap-[9px]">
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
  signedIn = false,
  isSuper = false,
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
    <aside className="hidden w-[216px] flex-none flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
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
          <summary className="flex h-[34px] cursor-pointer list-none items-center justify-between gap-2 rounded-token border border-[#33322c] bg-sidebar-well px-2.5 text-[12.5px] font-medium text-sidebar-foreground-bright [&::-webkit-details-marker]:hidden">
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
        {/* Driven by the shared nav list so this and the mobile top bar cannot
            drift. The sidebar shows every item; a pending one is a disabled
            row, never a link. 阵容's href already carries the team in scope. */}
        {navItems(season, division, teamCode).map((item) =>
          item.pending ? (
            <PendingNavItem key={item.key} label={item.label} icon={item.icon} />
          ) : (
            <NavLink
              key={item.key}
              label={item.label}
              icon={item.icon}
              href={item.href!}
              current={section === item.key}
            />
          ),
        )}
      </nav>

      {signedIn ? (
        <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-2 pb-1 pt-1.5">
          {isSuper ? (
            <Link
              href="/admin"
              aria-current={section === "admin" ? "page" : undefined}
              className={cn(
                "flex h-[34px] items-center gap-[9px] rounded-token px-2.5 no-underline",
                section === "admin"
                  ? "border-l-2 border-l-[#c9502f] bg-sidebar-active pl-2 text-[13px] font-medium text-sidebar-foreground-bright"
                  : "text-[13px] text-sidebar-foreground hover:bg-sidebar-active",
              )}
            >
              {/* A key: this is where competition passwords are minted. */}
              <NavIcon path="M10.5 2.5a3 3 0 0 0-2.83 4L2.5 11.67V13.5H4.33l.5-.5v-1h1v-1h1l1.34-1.34a3 3 0 1 0 2.83-6.16zM11.5 5a1 1 0 1 1-1-1" />
              <span>比赛密码</span>
            </Link>
          ) : null}
          <form
            action={logout}
            className="flex items-center justify-between gap-2 px-1.5 py-1"
          >
            <span className="text-[12px] text-sidebar-foreground-bright">管理员</span>
            <button
              type="submit"
              className="font-mono text-[10.5px] text-sidebar-foreground-dim underline"
            >
              登出
            </button>
          </form>
        </div>
      ) : (
        // Signed-out: the one way into an admin session from the sidebar. The
        // in-place 编辑模式 unlock on data pages is for scoped captains; this
        // link goes to /login, which only the super password satisfies.
        <Link
          href="/login"
          className="flex items-center gap-2 border-t border-sidebar-border px-3.5 py-2.5 text-[12px] text-sidebar-foreground no-underline hover:bg-sidebar-active"
        >
          管理员登录
        </Link>
      )}

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
