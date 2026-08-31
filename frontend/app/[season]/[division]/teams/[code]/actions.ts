"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";
import type { CurrentUtrEdit } from "./RosterTable";

/**
 * Save one player's current UTR from the roster page.
 *
 * Goes through the same batch endpoint the sheet uses — a batch of one —
 * rather than a second write path with its own rules about what counts as
 * "leave it alone". One rule, one place.
 */
export async function saveCurrentUtr(
  season: string,
  division: string,
  teamCode: string,
  edit: CurrentUtrEdit,
): Promise<void> {
  await adminWrite("PUT", "/api/players/current-utr", {
    // The season travels with the write: while it is unlocked, a new current
    // doubles UTR becomes that season's participation UTR too, which is the
    // only number a lineup can be built from before the committee's arrives.
    season_year: Number(season),
    updates: [edit],
  });
  revalidatePath(`/${season}/${division}/teams/${teamCode}`);
}
