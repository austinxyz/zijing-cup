import type { LineupPlayer, PlayerNote, SavedLineup } from "@/lib/api";
import { playerName } from "@/lib/name";

/** One side of the comparison: a saved lineup plus its team's roster indexed by
 *  the player key the assignment uses. The key-bearing roster is the lineup
 *  roster (`LineupPlayer`, from getTeamLineups) — saved lineups' assignment uses
 *  those keys, and RosterPlayer (getTeamRoster) has no key. `player_id` is kept
 *  so confidential notes can be attached per player. */
export interface CompareSide {
  savedLineup: SavedLineup;
  byKey: Map<
    string,
    Pick<LineupPlayer, "last_name" | "first_name" | "gender" | "player_id">
  >;
  /** Confidential notes by player_id (empty for a locked viewer — but the whole
   *  compare page is canEdit-gated, so this is populated whenever it renders). */
  notesByPlayer: Record<number, PlayerNote[]>;
}

export interface CompareCell {
  players: { name: string; gender: string | null; notes: PlayerNote[] }[];
  /** The line's current participation-UTR sum (Decimal string), or null when
   *  this side has no total for the line. */
  sum: string | null;
}

export interface CompareRow {
  line: string;
  a: CompareCell;
  b: CompareCell;
  /** my sum − opp sum, for display only (two decimals). null when either side
   *  lacks the line's sum. */
  diff: number | null;
}

export interface Comparison {
  rows: CompareRow[];
  totalA: string | null;
  totalB: string | null;
  totalDiff: number | null;
  statusA: SavedLineup["status"];
  statusB: SavedLineup["status"];
}

/** Rounded to two decimals — purely for display, never written back or used to
 *  decide anything. The values are Decimal strings; this Number() diff is a
 *  presentation convenience, not a source of truth. */
function round2(n: number): number {
  return Number(n.toFixed(2));
}

function cell(side: CompareSide, line: string): CompareCell {
  const keys = side.savedLineup.assignment[line] ?? [];
  const players = keys.map((k) => {
    const p = side.byKey.get(k);
    // A key with no roster row: the person is gone or the key drifted. Say so
    // rather than render an empty name.
    return p
      ? {
          name: playerName(p),
          gender: p.gender,
          notes: side.notesByPlayer[p.player_id] ?? [],
        }
      : { name: "（缺）", gender: null, notes: [] };
  });
  const sum = side.savedLineup.line_totals?.[line]?.total ?? null;
  return { players, sum };
}

/**
 * Assemble a line-by-line comparison of two saved lineups. Pure: no fetching,
 * no judgement — just pairs, current line sums, and their numeric difference for
 * display. Line order comes from the caller (the division's rule line order).
 * A diff is computed only when BOTH sides have that line's sum (else null); the
 * whole-lineup total diff only when both totals are present (a `player_gone`
 * lineup has a null total, so no fake total is invented).
 */
export function buildComparison(
  lineOrder: string[],
  a: CompareSide,
  b: CompareSide,
): Comparison {
  const rows: CompareRow[] = lineOrder.map((line) => {
    const ca = cell(a, line);
    const cb = cell(b, line);
    const diff =
      ca.sum != null && cb.sum != null
        ? round2(Number(ca.sum) - Number(cb.sum))
        : null;
    return { line, a: ca, b: cb, diff };
  });

  const totalA = a.savedLineup.total ?? null;
  const totalB = b.savedLineup.total ?? null;
  const totalDiff =
    totalA != null && totalB != null
      ? round2(Number(totalA) - Number(totalB))
      : null;

  return {
    rows,
    totalA,
    totalB,
    totalDiff,
    statusA: a.savedLineup.status,
    statusB: b.savedLineup.status,
  };
}
