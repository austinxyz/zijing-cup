"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";

/**
 * Match-record writes. Each is gated by the competition in context via
 * `adminWrite`'s scope check ({season, division}); the backend only sees the
 * POST/DELETE. The whole-tie outcome is derived server-side, never sent.
 *
 * revalidatePath uses "layout" scope so both the matches list and any nested
 * detail/compare-history route under the segment refresh (same data, two places).
 */

export interface MatchLineInput {
  our: string[];
  opp: (number | null)[];
  outcome: "win" | "loss";
  note: string;
}

export interface MatchInput {
  our_team_code: string;
  opponent_team_code: string;
  match_date: string;
  round_label: string | null;
  source_lineup_id: number | null;
  lines: Record<string, MatchLineInput>;
}

function base(season: string, division: string): string {
  return `/api/seasons/${season}/divisions/${division}/matches`;
}

export async function createMatch(
  season: string,
  division: string,
  input: MatchInput,
): Promise<void> {
  // Trim the free-text round label at the entry point (matches the codebase's
  // other write actions); length/empty are enforced by the backend + DB check,
  // the single source of truth, so we don't duplicate the limit here.
  const body = {
    ...input,
    round_label: input.round_label == null ? null : input.round_label.trim() || null,
  };
  await adminWrite("POST", base(season, division), body, { season, division });
  revalidatePath(`/${season}/${division}/matches`, "layout");
}

export async function deleteMatch(
  season: string,
  division: string,
  matchId: number,
): Promise<void> {
  await adminWrite(
    "DELETE",
    `${base(season, division)}/${matchId}`,
    undefined,
    { season, division },
  );
  revalidatePath(`/${season}/${division}/matches`, "layout");
}
