"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";

function base(season: string): string {
  return `/api/seasons/${season}/participation-utr`;
}

/**
 * Snapshot every season player's current doubles UTR under today's date.
 *
 * A committee (super-admin) action: the monitor spans both divisions, so it is
 * super-only rather than scoped to one competition. Bound by the page to the
 * season; the client supplies nothing.
 */
export async function snapshotToday(season: string): Promise<void> {
  await adminWrite("POST", `${base(season)}/snapshot`, undefined, "super-only");
  revalidatePath(`/${season}/participation-utr`, "layout");
}

/**
 * Set a player's rated-day average as this season's participation UTR. The
 * backend refuses (422) unless every sampled day is rated, and (409) on a
 * locked season — surfaced to the caller.
 */
export async function setParticipationFromSampling(
  season: string,
  playerId: number,
): Promise<void> {
  await adminWrite(
    "POST",
    `${base(season)}/${playerId}/set`,
    undefined,
    "super-only",
  );
  revalidatePath(`/${season}/participation-utr`, "layout");
}
