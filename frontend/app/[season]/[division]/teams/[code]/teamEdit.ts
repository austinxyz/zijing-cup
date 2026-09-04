import type { RosterPlayer, TeamRoster } from "@/lib/api";

export interface BorrowedCaps {
  roster_cap: number;
  on_court_cap: number;
}

/**
 * The borrowed caps for a given school_count, or null when they cannot be
 * determined (school_count unset, or the division has no rule for that count) —
 * null means "no cap to show / enforce".
 */
export function capsFor(
  limits: TeamRoster["borrowed_limits"],
  schoolCount: number | null,
): BorrowedCaps | null {
  if (schoolCount == null) return null;
  return limits[String(schoolCount)] ?? null;
}

/**
 * How many players would be borrowed after applying the pending flag overrides
 * (player_id -> new is_borrowed_player). Only CONFIRMED borrowed count — the
 * same rule the engine uses (unmarked/false do not count).
 */
export function borrowedCountWith(
  players: RosterPlayer[],
  pending: Record<number, boolean>,
): number {
  let n = 0;
  for (const p of players) {
    const flag =
      p.player_id in pending ? pending[p.player_id] : p.is_borrowed_player === true;
    if (flag) n += 1;
  }
  return n;
}

/** Whether the roster's borrowed count exceeds roster_cap. False when caps are
 *  unknown (nothing to compare against). */
export function rosterOverCap(count: number, caps: BorrowedCaps | null): boolean {
  if (caps == null) return false;
  return count > caps.roster_cap;
}
