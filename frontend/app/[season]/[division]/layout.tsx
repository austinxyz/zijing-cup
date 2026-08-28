import { notFound } from "next/navigation";

import { getSeasons, type SeasonIndex } from "@/lib/api";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ season: string; division: string }>;
}

/**
 * The shell every data page shares.
 *
 * It lives in the layout rather than inside each page for one concrete
 * reason: `error.tsx` and `loading.tsx` replace whatever sits *below* them.
 * With the sidebar inside a page, one failed fetch blanks the entire window —
 * the sibling project shipped that bug and it read as a crash rather than a
 * section failing to load.
 */
export default async function DivisionLayout({ children, params }: LayoutProps) {
  const { season, division } = await params;

  let seasons: SeasonIndex[] = [];
  try {
    seasons = await getSeasons();
  } catch {
    // The switcher loses its options, but the shell — and the page's own
    // error state — still render. An outage should not take the chrome down
    // with it.
    seasons = [];
  }

  const known = seasons.find((entry) => String(entry.year) === season);
  const match = known?.divisions.find((item) => item.code === division);

  // Only reject when the season list is known AND the division is absent
  // from it. Rejecting on an empty list would turn a backend outage into a
  // 404, which says something false about the URL.
  if (seasons.length > 0 && !match) notFound();

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-background">
      <Sidebar
        season={season}
        division={division}
        // Falls back to the URL's code rather than inventing a display name.
        divisionName={match?.display_name ?? division}
        seasons={seasons}
      />
      {children}
    </div>
  );
}
