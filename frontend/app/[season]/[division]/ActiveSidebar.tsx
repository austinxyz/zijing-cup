"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import type { SeasonIndex } from "@/lib/api";
import { Sidebar, type NavSection } from "./Sidebar";

/**
 * Tells the sidebar which section the URL is under.
 *
 * A layout cannot read its child route's params, so the active section comes
 * from the selected segment. Derived from the URL on every render rather than
 * held in state, so it cannot drift from the address bar.
 */
export function ActiveSidebar(props: {
  season: string;
  division: string;
  divisionName: string;
  seasons: SeasonIndex[];
}) {
  const segment = useSelectedLayoutSegment();
  const section: NavSection = segment === "teams" ? "teams" : "rules";

  return <Sidebar {...props} section={section} />;
}
