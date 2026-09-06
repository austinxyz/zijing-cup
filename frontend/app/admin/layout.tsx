import { getSeasons, type SeasonIndex } from "@/lib/api";
import { isSignedIn, isSuper } from "@/lib/admin";

import { Sidebar } from "../[season]/[division]/Sidebar";

/**
 * The /admin page keeps the app's sidebar so it does not read as a detached
 * screen you fell out of the app into.
 *
 * /admin is cross-competition (super sets ANY competition's password), so it
 * has no season/division of its own. The sidebar is competition-scoped, so it
 * is rendered against the latest competition purely to power the switcher and
 * the back-into-the-app nav — no competition item is marked current here
 * (`section="admin"`); the 比赛密码 link is. A backend outage degrades to an
 * empty switcher rather than taking the chrome down, same as the division
 * layout.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let seasons: SeasonIndex[] = [];
  try {
    seasons = await getSeasons();
  } catch {
    seasons = [];
  }

  const latest = seasons[0];
  const division = latest?.divisions[0];

  return (
    <div className="shell-height flex flex-col overflow-hidden bg-background md:min-h-[640px] md:flex-row">
      <Sidebar
        season={latest ? String(latest.year) : ""}
        division={division?.code ?? ""}
        divisionName={division?.display_name ?? ""}
        seasons={seasons}
        section="admin"
        signedIn={await isSignedIn()}
        isSuper={await isSuper()}
      />
      {children}
    </div>
  );
}
