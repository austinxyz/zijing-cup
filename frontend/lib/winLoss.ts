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
