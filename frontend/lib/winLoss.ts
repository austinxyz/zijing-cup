/** How a career win/loss record is shown.
 *
 *  `record` is `胜-负` (e.g. "67-20"), or "—" when the record was never
 *  imported. `rate` is the win percentage as a whole-number string ("77%"),
 *  or null when there is no percentage to show.
 *
 *  Three states, deliberately distinct:
 *  - either count null → never imported → "—" / null. NOT "0-0"/"0%": a
 *    missing record is a different claim from a real 0-0 one, and showing 0%
 *    for "unknown" is the "错的标签比没有标签更糟" trap.
 *  - both present but 0-0 → "0-0" / null: a real (if empty) record, but no
 *    percentage — dividing by zero would be NaN.
 *  - otherwise → "胜-负" / rounded percentage.
 */
export function formatWinLoss(
  wins: number | null,
  losses: number | null,
): { record: string; rate: string | null } {
  // Loose `== null` on purpose: it catches both null (never imported) and
  // undefined (the field absent from an older/stale API response). A strict
  // `=== null` would let undefined fall through to `undefined - undefined` →
  // "undefined-undefined" / "NaN%", which is exactly what a stale backend
  // once rendered on the page.
  if (wins == null || losses == null) {
    return { record: "—", rate: null };
  }
  const total = wins + losses;
  if (total === 0) {
    return { record: "0-0", rate: null };
  }
  return { record: `${wins}-${losses}`, rate: `${Math.round((wins / total) * 100)}%` };
}

/** The win percentage as a number, or null when there is no rate to compute
 *  (never imported, or a real 0-0 with no games). Same null/undefined and
 *  divide-by-zero guards as formatWinLoss. */
export function winRate(
  wins: number | null,
  losses: number | null,
): number | null {
  if (wins == null || losses == null) return null;
  const total = wins + losses;
  if (total === 0) return null;
  return (wins / total) * 100;
}

/** A "hot hand": a real win rate at or above the threshold (default 60%). null
 *  records (never imported) and 0-0 are not hot — absence is not a low score. */
export function isHotHand(
  wins: number | null | undefined,
  losses: number | null | undefined,
  threshold = 60,
): boolean {
  const rate = winRate(wins ?? null, losses ?? null);
  return rate !== null && rate >= threshold;
}
