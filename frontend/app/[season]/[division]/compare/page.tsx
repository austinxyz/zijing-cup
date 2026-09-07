import { redirect } from "next/navigation";

import {
  getDivisionRules,
  getDivisionTeams,
  getSavedLineups,
  getTeamLineups,
  type LineupPlayer,
  type SavedLineup,
} from "@/lib/api";
import { canEdit as canEditCompetition } from "@/lib/admin";

import { CompareControls } from "./CompareControls";
import { buildComparison, type CompareSide } from "./compareBuild";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const STATUS_LABEL: Record<SavedLineup["status"], string | null> = {
  valid: null,
  utr_moved: "UTR 已变",
  illegal: "已非法",
  player_gone: "有人离队",
};

function gtoken(g: string | null): string {
  return g === "M" ? "♂" : g === "F" ? "♀" : "·";
}
function gcls(g: string | null): string {
  return g === "M" ? "text-[#1f5fd0]" : g === "F" ? "text-[#ab237f]" : "text-muted-foreground";
}
/** Signed, two-decimal, for display only (closes the trailing-zero gap). */
function fmtDiff(n: number | null): string {
  if (n == null) return "—";
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}
function diffCls(n: number | null): string {
  if (n == null || n === 0) return "text-muted";
  return n > 0 ? "text-success" : "text-danger";
}

/**
 * 对手对比：两侧「队 + 已存阵容」逐线并排。已存阵容是管理员机密，故整页按
 * canEdit gate（未解锁重定向），无游客视图。只摆 UTR 事实，不判胜负。
 */
export default async function ComparePage({ params, searchParams }: PageProps) {
  const { season, division } = await params;
  const q = await searchParams;

  if (!(await canEditCompetition(season, division))) {
    redirect(`/${season}/${division}/teams`);
  }

  const a = one(q.a);
  const al = one(q.al);
  const b = one(q.b);
  const bl = one(q.bl);

  const [teams, rules] = await Promise.all([
    getDivisionTeams(season, division),
    getDivisionRules(season, division),
  ]);
  const teamList = teams ?? [];
  const lineOrder =
    rules?.lines
      .slice()
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((l) => l.code) ?? [];

  async function loadSide(
    team: string,
  ): Promise<{ lineups: SavedLineup[]; roster: LineupPlayer[] | null }> {
    if (!team) return { lineups: [], roster: null };
    const [lineups, teamLineups] = await Promise.all([
      getSavedLineups(season, division, team),
      // Its `.roster` (LineupPlayer[]) carries the player `key` the saved
      // lineup's assignment uses; getTeamRoster's RosterPlayer has no key.
      getTeamLineups(season, division, team),
    ]);
    return { lineups, roster: teamLineups?.roster ?? null };
  }
  const [sideAData, sideBData] = await Promise.all([loadSide(a), loadSide(b)]);

  const lineupA = sideAData.lineups.find((l) => String(l.id) === al) ?? null;
  const lineupB = sideBData.lineups.find((l) => String(l.id) === bl) ?? null;

  function makeSide(
    lineup: SavedLineup | null,
    roster: LineupPlayer[] | null,
  ): CompareSide | null {
    if (!lineup || !roster) return null;
    const byKey = new Map<string, LineupPlayer>(roster.map((p) => [p.key, p]));
    return { savedLineup: lineup, byKey };
  }
  const sideA = makeSide(lineupA, sideAData.roster);
  const sideB = makeSide(lineupB, sideBData.roster);
  const comparison = sideA && sideB ? buildComparison(lineOrder, sideA, sideB) : null;

  const statusA = lineupA ? STATUS_LABEL[lineupA.status] : null;
  const statusB = lineupB ? STATUS_LABEL[lineupB.status] : null;

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <h1 className="text-base font-semibold text-foreground">对手对比</h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          两侧各选一支队与它的一套已存阵容 · 逐线只摆 UTR 事实，不判胜负
        </span>
      </div>

      <CompareControls
        teams={teamList}
        lineupsA={sideAData.lineups}
        lineupsB={sideBData.lineups}
        sel={{ a, al, b, bl }}
      />

      {comparison ? (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="w-[52px] border-b border-border bg-surface-muted px-3 py-2 text-left font-mono text-[10.5px] text-muted-foreground">线位</th>
                <th className="border-b border-border bg-surface-muted px-3 py-2 text-left font-mono text-[10.5px] text-muted-foreground">
                  我方{statusA ? <span className="ml-1.5 rounded-full border border-warning-border bg-warning-surface px-1.5 text-warning">{statusA}</span> : null}
                </th>
                <th className="w-[80px] border-b border-border bg-surface-muted px-3 py-2 text-center font-mono text-[10.5px] text-muted-foreground">差距</th>
                <th className="border-b border-border bg-surface-muted px-3 py-2 text-left font-mono text-[10.5px] text-muted-foreground">
                  对手{statusB ? <span className="ml-1.5 rounded-full border border-warning-border bg-warning-surface px-1.5 text-warning">{statusB}</span> : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.line}>
                  <td className="border-b border-border/60 px-3 py-2 font-mono font-semibold">{row.line}</td>
                  <td className="border-b border-border/60 px-3 py-2">
                    <Pair cell={row.a} />
                  </td>
                  <td className={`border-b border-border/60 px-3 py-2 text-center font-mono font-semibold ${diffCls(row.diff)}`}>
                    {fmtDiff(row.diff)}
                  </td>
                  <td className="border-b border-border/60 px-3 py-2">
                    <Pair cell={row.b} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 font-mono font-semibold bg-surface-muted">总和</td>
                <td className="px-3 py-2 font-mono bg-surface-muted">{comparison.totalA ?? "—"}</td>
                <td className={`px-3 py-2 text-center font-mono font-semibold bg-surface-muted ${diffCls(comparison.totalDiff)}`}>{fmtDiff(comparison.totalDiff)}</td>
                <td className="px-3 py-2 font-mono bg-surface-muted">{comparison.totalB ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-5 text-[13px] text-muted">
          选好两侧的「队 + 已存阵容」后在这里逐线并排。
        </div>
      )}
    </main>
  );
}

function Pair({ cell }: { cell: { players: { name: string; gender: string | null }[]; sum: string | null } }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12.5px]">
        {cell.players.length === 0
          ? "—"
          : cell.players.map((p, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {p.name} <span className={`font-bold ${gcls(p.gender)}`}>{gtoken(p.gender)}</span>
              </span>
            ))}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">线和 {cell.sum ?? "—"}</span>
    </div>
  );
}
