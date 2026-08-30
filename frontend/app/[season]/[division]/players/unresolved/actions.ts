"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";

/**
 * Settle one contested season.
 *
 * The value may be neither candidate — the committee can correct both sheets
 * after they were frozen — so this takes whatever the form carries rather than
 * a choice between two.
 */
export async function ruleOnSeason(formData: FormData): Promise<void> {
  const playerId = String(formData.get("playerId"));
  const seasonYear = String(formData.get("seasonYear"));
  const season = String(formData.get("season"));
  const division = String(formData.get("division"));
  const value = String(formData.get("value") ?? "").trim();

  if (!value) return;

  await adminWrite(
    "POST",
    `/api/players/${playerId}/season-utrs/${seasonYear}/ruling`,
    { value },
  );

  revalidatePath(`/${season}/${division}/players/unresolved`);
}
