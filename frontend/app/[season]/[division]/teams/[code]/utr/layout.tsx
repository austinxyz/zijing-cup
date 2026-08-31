import { redirect } from "next/navigation";

import { isSignedIn } from "@/lib/admin";

/**
 * This route's own login gate.
 *
 * It sits under `teams/`, so the gate on `players/` does not reach it —
 * copied rather than shared because the alternative is an admin screen that
 * renders for anyone who knows the URL. The write endpoint refuses
 * unauthenticated callers regardless; this is the other half, so a signed-out
 * visitor gets sent to log in instead of a screen whose every control fails.
 */
export default async function UtrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isSignedIn())) redirect("/login");
  return <>{children}</>;
}
