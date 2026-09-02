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
