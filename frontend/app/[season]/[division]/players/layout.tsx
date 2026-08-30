import { redirect } from "next/navigation";

import { isSignedIn } from "@/lib/admin";

/**
 * Everything under 队员管理 needs a session.
 *
 * Checked once here rather than in each page: the failure mode of per-page
 * checks is the page somebody adds later without one. Redirecting — rather
 * than rendering an empty admin screen — is what keeps the sidebar link from
 * being a control that appears to do nothing.
 */
export default async function PlayersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isSignedIn())) redirect("/login");
  return <>{children}</>;
}
