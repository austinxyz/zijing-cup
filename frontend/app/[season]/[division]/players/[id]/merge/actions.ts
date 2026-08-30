"use server";

import { redirect } from "next/navigation";

import { adminWrite } from "@/lib/admin";

/**
 * Fold one record into another. The absorbed one is deleted.
 *
 * `playerId` survives; `mergeId` disappears. Irreversible — the page states
 * both, and which is which, before this runs.
 */
export async function mergePlayers(formData: FormData): Promise<void> {
  const playerId = String(formData.get("playerId"));
  const mergeId = Number(formData.get("mergeId"));
  const season = String(formData.get("season"));
  const division = String(formData.get("division"));

  await adminWrite("POST", `/api/players/${playerId}/merge`, {
    merge_id: mergeId,
  });

  redirect(`/${season}/${division}/players/${playerId}`);
}
