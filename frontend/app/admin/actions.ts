"use server";

import { revalidatePath } from "next/cache";

import {
  NotAuthorizedForCompetition,
  adminWrite,
  isSuper,
} from "@/lib/admin";
import { hashPassword } from "@/lib/session";

/**
 * Set (or rotate) a competition's admin password. Super only.
 *
 * The password is hashed HERE, on the Next side (same scrypt everything else
 * uses) — the plaintext never reaches the backend. Two guards, on purpose: this
 * action refuses unless the session is super (so a scoped admin cannot even
 * reach the PUT), and `adminWrite(..., "super-only")` refuses again at the write
 * layer. Belt and suspenders for the one action that mints edit rights.
 */
export async function setCompetitionPassword(
  season: string,
  division: string,
  password: string,
): Promise<void> {
  if (!(await isSuper())) throw new NotAuthorizedForCompetition();

  const trimmed = password.trim();
  if (!trimmed) throw new Error("密码不能为空");

  await adminWrite(
    "PUT",
    `/api/seasons/${season}/divisions/${encodeURIComponent(division)}/admin-credential`,
    { password_hash: hashPassword(trimmed) },
    "super-only",
  );
  revalidatePath("/admin");
}
