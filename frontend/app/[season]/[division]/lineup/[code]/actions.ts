"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";
import type { LineupFilterPreset } from "@/lib/api";

function presetsPath(season: string, division: string, team: string): string {
  return `/api/seasons/${season}/divisions/${division}/teams/${encodeURIComponent(team)}/presets`;
}

/**
 * Save the current locks/exclusions as a named preset for this team.
 *
 * Bound by the page to (season, division, team, constraints); the client only
 * supplies the name. The write rides adminWrite, so an expired login surfaces
 * as "log in again" rather than a backend 403.
 */
export async function savePreset(
  season: string,
  division: string,
  team: string,
  constraints: LineupFilterPreset["constraints"],
  name: string,
): Promise<void> {
  await adminWrite("POST", presetsPath(season, division, team), {
    name,
    constraints,
  });
  revalidatePath(`/${season}/${division}/lineup/${team}`);
}

export async function deletePreset(
  season: string,
  division: string,
  team: string,
  id: number,
): Promise<void> {
  await adminWrite(
    "DELETE",
    `${presetsPath(season, division, team)}/${id}`,
  );
  revalidatePath(`/${season}/${division}/lineup/${team}`);
}

function savedPath(season: string, division: string, team: string): string {
  return `/api/seasons/${season}/divisions/${division}/teams/${encodeURIComponent(team)}/saved-lineups`;
}

/**
 * Save a specific ten-player line assignment as a named lineup for this team.
 *
 * Bound by the page to (season, division, team); the client supplies the name
 * and the assignment (from the candidate row). The UTR snapshot is built
 * server-side from the current roster — never sent from the browser, never
 * written back to a player.
 */
export async function saveLineup(
  season: string,
  division: string,
  team: string,
  name: string,
  assignment: Record<string, [string, string]>,
): Promise<void> {
  await adminWrite("POST", savedPath(season, division, team), {
    name,
    assignment,
  });
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}

/** Overwrite a saved lineup's assignment in place and re-snapshot its UTRs.
 *  The edit is a PUT; the backend re-snapshots from the current roster. */
export async function saveBackLineup(
  season: string,
  division: string,
  team: string,
  id: number,
  assignment: Record<string, [string, string]>,
): Promise<void> {
  await adminWrite("PUT", `${savedPath(season, division, team)}/${id}`, {
    assignment,
  });
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}

export async function deleteSavedLineup(
  season: string,
  division: string,
  team: string,
  id: number,
): Promise<void> {
  await adminWrite("DELETE", `${savedPath(season, division, team)}/${id}`);
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}
