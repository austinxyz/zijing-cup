import type { LineupPlayer, SavedComparison, SavedLineup } from "@/lib/api";
import { buildComparison, type CompareSide } from "./compareBuild";

export interface CompareSeatView {
  name: string;
  gender: string | null;
}

export interface CompareLineView {
  line: string;
  /** null when that side's lineup was deleted. */
  a: CompareSeatView[] | null;
  b: CompareSeatView[] | null;
  aSum: string | null;
  bSum: string | null;
  /** my sum − opp sum, display only; null unless both sides have the sum. */
  diff: number | null;
  /** The saved per-line note ("" when none). */
  note: string;
}

export interface SavedComparisonView {
  id: number;
  name: string;
  /** Human label per side: "<team> <lineup>" or "<team>（阵容已删）". */
  aLabel: string;
  bLabel: string;
  aDeleted: boolean;
  bDeleted: boolean;
  lines: CompareLineView[];
  totalA: string | null;
  totalB: string | null;
  totalDiff: number | null;
}

/** One resolved side: its saved lineup + the team's key-bearing roster. Null
 *  when the referenced saved lineup no longer exists. */
export interface ResolvedSide {
  teamCode: string;
  lineup: SavedLineup | null;
  roster: LineupPlayer[] | null;
}

/**
 * Build a comparison's display view from its stored references and the current
 * state of the two referenced lineups. A side whose lineup was deleted (or whose
 * roster is missing) is marked `aDeleted`/`bDeleted` and rendered as "阵容已删"
 * rather than dropping the whole comparison — the references are kept.
 *
 * When both sides resolve, the per-line seats/sums/diff come from the shared
 * `buildComparison` (the same pure function the ad-hoc compare uses), so a saved
 * comparison and a live one read identically.
 */
export function buildComparisonView(
  row: SavedComparison,
  a: ResolvedSide,
  b: ResolvedSide,
  lineOrder: string[],
): SavedComparisonView {
  const aDeleted = a.lineup === null || a.roster === null;
  const bDeleted = b.lineup === null || b.roster === null;

  const label = (side: ResolvedSide, deleted: boolean): string =>
    deleted
      ? `${side.teamCode}（阵容已删）`
      : `${side.teamCode} ${side.lineup!.name}`;

  const notesFor = (line: string): string => row.line_notes[line] ?? "";

  if (aDeleted || bDeleted) {
    // Cannot run buildComparison without both sides — surface the line notes and
    // whichever side survives, marking the other 已删.
    const lines: CompareLineView[] = lineOrder.map((line) => ({
      line,
      a: aDeleted ? null : seats(a, line),
      b: bDeleted ? null : seats(b, line),
      aSum: aDeleted ? null : a.lineup!.line_totals?.[line]?.total ?? null,
      bSum: bDeleted ? null : b.lineup!.line_totals?.[line]?.total ?? null,
      diff: null,
      note: notesFor(line),
    }));
    return {
      id: row.id, name: row.name,
      aLabel: label(a, aDeleted), bLabel: label(b, bDeleted),
      aDeleted, bDeleted, lines,
      totalA: aDeleted ? null : a.lineup!.total ?? null,
      totalB: bDeleted ? null : b.lineup!.total ?? null,
      totalDiff: null,
    };
  }

  const sideA: CompareSide = { savedLineup: a.lineup!, byKey: index(a.roster!), notesByPlayer: {} };
  const sideB: CompareSide = { savedLineup: b.lineup!, byKey: index(b.roster!), notesByPlayer: {} };
  const comparison = buildComparison(lineOrder, sideA, sideB);

  return {
    id: row.id, name: row.name,
    aLabel: label(a, false), bLabel: label(b, false),
    aDeleted: false, bDeleted: false,
    lines: comparison.rows.map((r) => ({
      line: r.line,
      a: r.a.players.map((p) => ({ name: p.name, gender: p.gender })),
      b: r.b.players.map((p) => ({ name: p.name, gender: p.gender })),
      aSum: r.a.sum, bSum: r.b.sum, diff: r.diff,
      note: notesFor(r.line),
    })),
    totalA: comparison.totalA, totalB: comparison.totalB, totalDiff: comparison.totalDiff,
  };
}

function index(roster: LineupPlayer[]) {
  return new Map(roster.map((p) => [p.key, p]));
}

function seats(side: ResolvedSide, line: string): CompareSeatView[] {
  const idx = index(side.roster!);
  const keys = side.lineup!.assignment[line] ?? [];
  return keys.map((k) => {
    const p = idx.get(k);
    return p
      ? { name: `${p.last_name} ${p.first_name}`, gender: p.gender }
      : { name: "（缺）", gender: null };
  });
}
