import type { LineupPlayer, SavedLineup } from "@/lib/api";
import { playerName } from "@/lib/name";

/** One on-court seat in a side's lineup preview. */
export interface PreviewSeat {
  key: string;
  name: string;
  gender: string | null;
  /** Participation UTR string, or null when the key has no roster row. */
  utr: string | null;
}

export interface PreviewLine {
  line: string;
  players: PreviewSeat[];
  /** The line's current participation-UTR sum (Decimal string), or null. */
  sum: string | null;
}

function byKey(
  roster: LineupPlayer[],
): Map<string, LineupPlayer> {
  return new Map(roster.map((p) => [p.key, p]));
}

/**
 * Resolve a saved lineup's `assignment` into a per-line on-court list, in the
 * division's line order. Pure — no fetching. Names/gender/participation UTR are
 * read from the team's lineup roster (the key-bearing one); a key with no roster
 * row renders as "（缺）" rather than an empty seat.
 */
export function buildSidePreview(
  lineup: SavedLineup,
  roster: LineupPlayer[],
  lineOrder: string[],
): PreviewLine[] {
  const index = byKey(roster);
  return lineOrder.map((line) => {
    const keys = lineup.assignment[line] ?? [];
    const players: PreviewSeat[] = keys.map((k) => {
      const p = index.get(k);
      return p
        ? { key: k, name: playerName(p), gender: p.gender, utr: p.match_utr }
        : { key: k, name: "（缺）", gender: null, utr: null };
    });
    const sum = lineup.line_totals?.[line]?.total ?? null;
    return { line, players, sum };
  });
}

/**
 * A short one-line signature for the lineup select option, so a reader can tell
 * the sets apart before choosing: the name plus the first line's two players.
 */
export function lineupSignature(
  lineup: SavedLineup,
  roster: LineupPlayer[],
  lineOrder: string[],
): string {
  const preview = buildSidePreview(lineup, roster, lineOrder);
  const first = preview.find((l) => l.players.length > 0);
  if (!first) return lineup.name;
  const who = first.players.map((p) => p.name).join("·");
  return `${lineup.name} · ${first.line} ${who}`;
}
