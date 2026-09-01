import type { SeasonIndex } from "@/lib/api";

export interface SwitcherOption {
  key: string;
  href: string;
  label: string;
  current: boolean;
}

/**
 * Every (season, division) pair, including the one already open.
 *
 * The current pair is kept and marked rather than omitted: hiding it made the
 * option set change membership on every switch, so you never saw all of them
 * at once and the list appeared to rewrite itself. These are links, not client
 * state — the URL decides which rules are in force. Shared by the sidebar and
 * the mobile top bar so the two switchers cannot disagree.
 */
export function switcherOptions(
  seasons: SeasonIndex[],
  season: string,
  division: string,
): SwitcherOption[] {
  return seasons.flatMap((entry) =>
    entry.divisions.map((item) => ({
      key: `${entry.year}-${item.code}`,
      href: `/${entry.year}/${item.code}/rules`,
      label: `${entry.year} · ${item.display_name}`,
      current: String(entry.year) === season && item.code === division,
    })),
  );
}
