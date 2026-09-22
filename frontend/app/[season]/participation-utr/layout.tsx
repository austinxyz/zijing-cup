import { getSeasons, type SeasonIndex } from "@/lib/api";
import { isSignedIn, isSuper } from "@/lib/admin";
import { Sidebar } from "../[division]/Sidebar";
import { TopNav } from "../[division]/TopNav";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ season: string }>;
}

/**
 * Shell for the season-level 参赛 UTR sampling page.
 *
 * The page lives at `/[season]/participation-utr`, outside the
 * `[season]/[division]` layout that carries the app chrome — so without its
 * own layout it rendered bare, with no sidebar. This gives it the same
 * shell + sidebar + mobile top bar.
 *
 * `section="participation"` marks the sidebar's 参赛 UTR entry current and
 * highlights no competition item (the page is not under any division). The
 * sidebar is division-scoped, so its nav links and switcher need a division:
 * we pick the season's first (gold), which the switcher lets the reader change.
 * Like the division layout, the shell lives here rather than in the page so a
 * failed fetch replaces only the content, never the chrome.
 */
export default async function ParticipationUtrLayout({
  children,
  params,
}: LayoutProps) {
  const { season } = await params;

  let seasons: SeasonIndex[] = [];
  try {
    seasons = await getSeasons();
  } catch {
    seasons = [];
  }

  const known = seasons.find((entry) => String(entry.year) === season);
  // A division only to anchor the nav links and switcher — the page itself is
  // cross-division. First of the season, else the conventional gold code.
  const division = known?.divisions[0]?.code ?? "gold";
  const divisionName = known?.divisions[0]?.display_name ?? division;

  return (
    <div className="shell-height flex flex-col overflow-hidden bg-background md:min-h-[640px] md:flex-row">
      <TopNav
        season={season}
        division={division}
        divisionName={divisionName}
        seasons={seasons}
        section="participation"
      />
      <Sidebar
        season={season}
        division={division}
        divisionName={divisionName}
        seasons={seasons}
        section="participation"
        signedIn={await isSignedIn()}
        isSuper={await isSuper()}
      />
      {children}
    </div>
  );
}
