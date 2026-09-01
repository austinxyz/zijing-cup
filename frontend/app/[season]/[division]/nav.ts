/**
 * The one list of nav destinations, shared by the sidebar and the top bar.
 *
 * Kept as data rather than duplicated JSX so the two presentations cannot
 * drift: the sidebar renders all of these, the top bar filters `admin` out.
 * Which entries exist, where they point, and which is pending all live here;
 * the components decide only how a row looks.
 */

/** Which nav destination the current URL is under. */
export type NavSection = "teams" | "lineup" | "rules" | "players";

export interface NavItem {
  /** Stable id; also the section it highlights on. */
  key: NavSection | "opponents";
  label: string;
  /** SVG path for the 16×16 icon. */
  icon: string;
  /** null for a destination that does not exist yet. */
  href: string | null;
  /** True for the not-yet-built destination — rendered disabled, never a link. */
  pending: boolean;
  /** True for 队员管理: a real page, but with no narrow layout, so the top bar
   *  drops it. The filter is on this flag, not on a name the top bar has to
   *  remember. */
  admin: boolean;
}

const GRID_ICON =
  "M2.6 2.6h4.2v4.2H2.6zM9.2 2.6h4.2v4.2H9.2zM2.6 9.2h4.2v4.2H2.6zM9.2 9.2h4.2v4.2H9.2z";
const CHART_ICON = "M2.6 13.4h10.8M4.8 11V7.2M8 11V3.4M11.2 11V5.8";
const SWAP_ICON =
  "M2.6 5.2h9.4M9.4 2.6L12 5.2 9.4 7.8M13.4 10.8H4M6.6 8.2L4 10.8l2.6 2.6";
const DOC_ICON = "M4 2.4h8v11.2H4zM6.4 5.4h3.2M6.4 8h3.2M6.4 10.6h2";
const PEOPLE_ICON =
  "M6 7.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.6 13.4c0-2 1.5-3.4 3.4-3.4s3.4 1.4 3.4 3.4M10.6 6.4a1.7 1.7 0 1 0 0-3.4M11.2 9.6c1.3.3 2.2 1.5 2.2 3";

/**
 * The nav destinations for a (season, division), with 阵容 already pointed at
 * the team in scope when there is one — so it opens that roster's lineup
 * rather than sending you through a picker to choose the team already on
 * screen.
 */
export function navItems(
  season: string,
  division: string,
  teamCode?: string,
): NavItem[] {
  const base = `/${season}/${division}`;
  return [
    {
      key: "teams",
      label: "队伍",
      icon: GRID_ICON,
      href: `${base}/teams`,
      pending: false,
      admin: false,
    },
    {
      key: "lineup",
      label: "阵容",
      icon: CHART_ICON,
      href: teamCode
        ? `${base}/lineup/${encodeURIComponent(teamCode)}`
        : `${base}/lineup`,
      pending: false,
      admin: false,
    },
    {
      key: "opponents",
      label: "对手对比",
      icon: SWAP_ICON,
      href: null,
      pending: true,
      admin: false,
    },
    {
      key: "rules",
      label: "赛制规则",
      icon: DOC_ICON,
      href: `${base}/rules`,
      pending: false,
      admin: false,
    },
    {
      key: "players",
      label: "队员管理",
      icon: PEOPLE_ICON,
      href: `${base}/players`,
      pending: false,
      admin: true,
    },
  ];
}
