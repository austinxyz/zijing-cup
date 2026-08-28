"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import type { TeamSummary } from "@/lib/api";
import { TeamList } from "./TeamList";

/**
 * Marks the team the URL names.
 *
 * The layout cannot see its child route's params, so the selection is read
 * from the active segment instead. That keeps the URL the only place the
 * selection lives: a reload or a shared link lands on the same team, which
 * component state could not promise.
 *
 * Client-side only for the segment read — the data was already fetched on the
 * server and arrives here as plain props.
 */
export function SelectedTeamList({
  season,
  division,
  teams,
}: {
  season: string;
  division: string;
  teams: TeamSummary[];
}) {
  const segment = useSelectedLayoutSegment();

  return (
    <TeamList
      season={season}
      division={division}
      teams={teams}
      selected={segment ?? undefined}
    />
  );
}
