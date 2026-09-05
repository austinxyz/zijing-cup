import { redirect } from "next/navigation";

import { canEdit } from "@/lib/admin";

/**
 * Everything under 队员管理 needs edit rights for THIS competition.
 *
 * Checked once here rather than in each page: the failure mode of per-page
 * checks is the page somebody adds later without one. A viewer who has not
 * unlocked this competition is sent to its team list (where the in-place unlock
 * lives) rather than to the global /login, which only accepts the super
 * password — a competition captain unlocks on their own competition's page.
 */
export default async function PlayersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ season: string; division: string }>;
}) {
  const { season, division } = await params;
  if (!(await canEdit(season, division))) redirect(`/${season}/${division}/teams`);
  return <>{children}</>;
}
