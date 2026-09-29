"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";

/**
 * Saved-comparison writes. Each is gated by the competition in context via
 * `adminWrite`'s scope check ({season, division}); the backend only sees the
 * POST/DELETE. A comparison stores REFERENCES (team codes + saved-lineup ids),
 * never a snapshot — the compare page recomputes on expand.
 */

interface ComparisonInput {
  name: string;
  team_a_code: string;
  lineup_a_id: number;
  team_b_code: string;
  lineup_b_id: number;
}

function base(season: string, division: string): string {
  return `/api/seasons/${season}/divisions/${division}/comparisons`;
}

export async function saveComparison(
  season: string,
  division: string,
  input: ComparisonInput,
): Promise<void> {
  // Trim the name at the entry point, matching the codebase's write actions
  // (addPlayerNote / savePlayerFields). Length/empty are still enforced by the
  // backend + DB check — the single source of truth — so we don't duplicate the
  // limit here where it could drift.
  const body = { ...input, name: input.name.trim() };
  await adminWrite("POST", base(season, division), body, { season, division });
  revalidatePath(`/${season}/${division}/compare`, "layout");
}

export async function setLineNote(
  season: string,
  division: string,
  comparisonId: number,
  lineCode: string,
  text: string,
): Promise<void> {
  // Trim, but keep an empty string meaningful: empty = clear this line's note
  // (the backend removes the key). So no early-return-on-empty here — unlike
  // addPlayerNote, empty is a valid operation, not a no-op.
  await adminWrite(
    "POST",
    `${base(season, division)}/${comparisonId}/line-note`,
    { line_code: lineCode, text: text.trim() },
    { season, division },
  );
  revalidatePath(`/${season}/${division}/compare`, "layout");
}

export async function deleteComparison(
  season: string,
  division: string,
  comparisonId: number,
): Promise<void> {
  await adminWrite(
    "DELETE",
    `${base(season, division)}/${comparisonId}`,
    undefined,
    { season, division },
  );
  revalidatePath(`/${season}/${division}/compare`, "layout");
}
