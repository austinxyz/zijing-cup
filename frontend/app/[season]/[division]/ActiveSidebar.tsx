"use client";

import {
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";

import type { SeasonIndex } from "@/lib/api";
import { Sidebar, type NavSection } from "./Sidebar";

/**
 * Tells the sidebar which section the URL is under, and which team.
 *
 * A layout cannot read its child route's params, so both come from the
 * selected segments. Derived from the URL on every render rather than held in
 * state, so they cannot drift from the address bar.
 */
export function ActiveSidebar(props: {
  season: string;
  division: string;
  divisionName: string;
  seasons: SeasonIndex[];
}) {
  const segment = useSelectedLayoutSegment();
  // Empty rather than null-checked at each use: there is no team in scope at
  // the division's own routes, and that is an ordinary state, not an error.
  const segments = useSelectedLayoutSegments() ?? [];

  const section: NavSection =
    segment === "teams" ? "teams" : segment === "lineup" ? "lineup" : "rules";

  // The team stays in scope across the two sections that have one, so 阵容
  // opens the roster you are looking at rather than a picker asking you to
  // choose it again.
  const teamCode =
    (segments[0] === "teams" || segments[0] === "lineup") && segments[1]
      ? decodeURIComponent(segments[1])
      : undefined;

  return <Sidebar {...props} section={section} teamCode={teamCode} />;
}
