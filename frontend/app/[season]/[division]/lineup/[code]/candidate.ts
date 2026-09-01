import type { LineupCandidate, LineupPlayer } from "@/lib/api";

export const GENDER_LABEL: Record<string, string> = { M: "男", F: "女" };

/** How many of the ten on court are playing on a derived (non-frozen) number.
 *  Legality is a property of the whole set, so this count is what drives the
 *  set-level estimate marker. */
export function estimatesIn(candidate: LineupCandidate): number {
  return Object.values(candidate.lines)
    .flat()
    .filter((player) => player.origin !== "frozen").length;
}

/** Two decimal places for display only. Never used for a comparison — those
 *  all happen on the server against exact decimals. */
export function money(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

/** The over-cap amount for a line, or null when it is within cap. Display
 *  only; the cap judgement itself is the backend's. */
export function overOf(over: string | null | undefined): string | null {
  if (over == null) return null;
  return Number(over) > 0 ? over : null;
}

/** Whether a player's participation number is derived rather than this
 *  season's frozen value. The one thing that distinguishes an estimate on the
 *  number itself. */
export function isEstimate(player: LineupPlayer): boolean {
  return player.origin !== "frozen";
}

/** The full wording the estimate marker stands in for. Shown once in a legend
 *  (desktop) or the expanded view (mobile); the dense per-row marker points at
 *  this, it does not replace it. */
export function estimateSentence(count: number): string {
  return `含 ${count} 个估算值，合法性待总表确认`;
}

/** Whether any line in the candidate is over its cap. Drives the compact
 *  「超 cap」flag on the mobile row. */
export function hasOver(candidate: LineupCandidate): boolean {
  return Object.values(candidate.line_totals).some(
    (lt) => overOf(lt.over) !== null,
  );
}
