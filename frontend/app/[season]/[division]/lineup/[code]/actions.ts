"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";
import type { LineupFilterPreset, LineupViolation } from "@/lib/api";

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

/**
 * Judge an edited assignment against the CURRENT participation UTRs and return
 * its violations (empty means legal). The editor calls this after every change.
 *
 * A write (POST) so it is admin-gated like the rest of the editor; it reuses
 * the backend's own `check_lineup`, so the front end never re-implements a
 * rule. Bound to (season,division,team); the client supplies the assignment.
 */
export async function validateAssignment(
  season: string,
  division: string,
  team: string,
  assignment: Record<string, [string, string]>,
): Promise<LineupViolation[]> {
  const result = await adminWrite(
    "POST",
    `${savedPath(season, division, team)}/validate`,
    { assignment },
  );
  const violations = (result as { violations?: LineupViolation[] } | null)
    ?.violations;
  return violations ?? [];
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

export async function reorderSavedLineups(
  season: string,
  division: string,
  team: string,
  orderedIds: number[],
): Promise<void> {
  // The whole ordered id set, so the write is idempotent and race-safe; the
  // backend rejects a list that is not exactly this team's ids.
  await adminWrite("PATCH", `${savedPath(season, division, team)}/order`, {
    order: orderedIds,
  });
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}

export async function cloneSavedLineup(
  season: string,
  division: string,
  team: string,
  id: number,
): Promise<void> {
  await adminWrite("POST", `${savedPath(season, division, team)}/${id}/clone`);
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}

export async function renameSavedLineup(
  season: string,
  division: string,
  team: string,
  id: number,
  name: string,
): Promise<void> {
  // Backend rejects an empty/over-long name (422) or a clash with another
  // lineup's name (409); adminWrite throws on non-2xx, surfaced by the caller.
  await adminWrite("PATCH", `${savedPath(season, division, team)}/${id}`, {
    name,
  });
  revalidatePath(`/${season}/${division}/lineup/${team}/saved`);
}
