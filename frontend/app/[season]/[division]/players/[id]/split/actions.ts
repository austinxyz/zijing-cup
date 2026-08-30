"use server";

import { redirect } from "next/navigation";

import { adminWrite } from "@/lib/admin";

/**
 * Split one player into two.
 *
 * Irreversible — this change ships no history — so the page states the outcome
 * before this runs. Everything not named stays with the original.
 */
export async function splitPlayer(formData: FormData): Promise<void> {
  const playerId = String(formData.get("playerId"));
  const season = String(formData.get("season"));
  const division = String(formData.get("division"));

  const created = (await adminWrite("POST", `/api/players/${playerId}/split`, {
    last_name: String(formData.get("lastName") ?? "").trim(),
    first_name: String(formData.get("firstName") ?? "").trim(),
    utr_profile_id: String(formData.get("utrProfileId") ?? "").trim() || null,
    membership_ids: formData.getAll("m").map((value) => Number(value)),
    season_years: formData.getAll("s").map((value) => Number(value)),
  })) as { id: number } | null;

  // Land on the new record rather than back on the old one: the thing worth
  // checking after a split is what the new person ended up with.
  redirect(`/${season}/${division}/players/${created?.id ?? playerId}`);
}
