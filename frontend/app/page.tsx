import { redirect } from "next/navigation";

import { getSeasons } from "@/lib/api";

/**
 * There is no useful root page: every screen is scoped to a season and a
 * division, so land the visitor on the current season's rules rather than
 * asking them to pick before they have seen anything.
 *
 * The destination comes from the data, not a constant — the "current season"
 * changes once a year and nothing here should need editing when it does.
 */
export default async function Home() {
  const seasons = await getSeasons();
  const newest = seasons[0];
  if (!newest || newest.divisions.length === 0) {
    throw new Error("no seasons are loaded; run the rules seed importer");
  }

  // Silver is the larger division by team count, so it is the more useful
  // landing page; the switcher is one click away.
  const division =
    newest.divisions.find((item) => item.code === "silver") ??
    newest.divisions[0];

  redirect(`/${newest.year}/${division.code}/rules`);
}
