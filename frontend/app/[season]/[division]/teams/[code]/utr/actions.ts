"use server";

import { adminWrite } from "@/lib/admin";

export interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
}

export interface PlayerChange {
  player_id: number;
  last_name: string;
  first_name: string;
  fields: FieldChange[];
}

export interface SheetError {
  line_number: number;
  message: string;
}

export interface SheetDiff {
  changes: PlayerChange[];
  errors: SheetError[];
  counts: Record<string, number>;
  covered: number;
  not_covered: number;
  /** False when anything is wrong. All or nothing: a column pasted one place
   *  over makes nearly every row wrong, and writing the rest would leave the
   *  database half new and half old with nothing recording which half. */
  applicable: boolean;
  elsewhere: Record<string, string[]>;
}

/**
 * Turn a pasted block or an uploaded file into a diff. Writes nothing.
 *
 * Behind the admin credential even though it only reads: it reports what a
 * write *would* do, and the reasoning about who may see that is the same.
 */
export async function previewSheet(
  year: string,
  division: string,
  teamCode: string,
  text: string,
): Promise<SheetDiff> {
  return (await adminWrite(
    "POST",
    `/api/seasons/${year}/divisions/${division}/teams/` +
      `${encodeURIComponent(teamCode)}/utr-sheet/preview`,
    { text },
  )) as SheetDiff;
}

/**
 * Apply a diff that has been looked at.
 *
 * Takes the sheet text again rather than the diff: the diff is what a human
 * read, and re-deriving it here means the thing written is computed from the
 * same source under the same rules, not from a payload that could have been
 * edited in between.
 */
export async function applySheet(
  year: string,
  division: string,
  teamCode: string,
  text: string,
): Promise<{ updated: number }> {
  return (await adminWrite(
    "POST",
    `/api/seasons/${year}/divisions/${division}/teams/` +
      `${encodeURIComponent(teamCode)}/utr-sheet/apply`,
    { text },
  )) as { updated: number };
}
