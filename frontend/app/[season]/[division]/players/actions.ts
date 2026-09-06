"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";

/**
 * Edit a player's identity fields (name / gender / UTR link). Gated by the
 * competition in context via `adminWrite`'s scope check; the plaintext of who
 * may write is decided on the Next side, the backend only sees the PATCH.
 *
 * Only the four identity fields are editable here on purpose — the current
 * singles/doubles UTR live on the team page, where writing the doubles value
 * carries the "mirror into participation UTR" side effect and its season-lock
 * guardrail. Editing them here would bypass that, so they are out of scope.
 */
export async function savePlayerFields(
  season: string,
  division: string,
  playerId: number,
  fields: {
    last_name: string;
    first_name: string;
    gender: string;
    utr_profile_id: string;
  },
): Promise<void> {
  const patch = {
    last_name: fields.last_name.trim(),
    first_name: fields.first_name.trim(),
    // "" means "clear it": gender null = unspecified, utr link null = not filled.
    gender: fields.gender ? fields.gender : null,
    utr_profile_id: fields.utr_profile_id.trim()
      ? fields.utr_profile_id.trim()
      : null,
  };

  await adminWrite("PATCH", `/api/players/${playerId}`, patch, {
    season,
    division,
  });
  revalidatePath(`/${season}/${division}/players`);
}
