import {
  getDivisionRules,
  getDivisionTeams,
  getPlayerNotesBatch,
  getSavedComparisons,
  getSavedLineups,
  getTeamRosterKeys,
  type LineupPlayer,
  type PlayerNote,
  type SavedLineup,
} from "@/lib/api";
import { canEdit as canEditCompetition } from "@/lib/admin";
import { EditModeToggle } from "@/app/[season]/[division]/lineup/[code]/EditModeToggle";
import { PlayerNotesBadges } from "@/components/notes/PlayerNotesBadges";

import { CompareControls } from "./CompareControls";
import { CompareSaveBar } from "./CompareSaveBar";
import { CompareSavedCards } from "./CompareSavedCards";
import { SideLineupPreview } from "./SideLineupPreview";
import { buildComparison, type CompareSide } from "./compareBuild";
import { buildComparisonView, type ResolvedSide } from "./comparisonView";
import { buildSidePreview, lineupSignature } from "./sidePreview";
import { deleteComparison, saveComparison, setLineNote } from "./actions";

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

  // Locked state — NOT a redirect: bouncing to the team list reads as "why did
  // it jump?". Stay on /compare, show a lock notice + the in-place unlock, and
  // render NO saved-lineup content (they are confidential).
  if (!(await canEditCompetition(season, division))) {
    return (
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
          <h1 className="text-base font-semibold text-foreground">对手对比</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            两侧各选一支队与它的一套已存阵容 · 逐线只摆 UTR 事实，不判胜负
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className="max-w-sm text-[13px] text-muted">
            对手对比要看两队的已存阵容，属管理员机密。解锁本比赛后才能使用。
          </p>
          <EditModeToggle signedIn={false} season={season} division={division} />
        </div>
      </main>
    );
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
    const [lineups, roster] = await Promise.all([
      getSavedLineups(season, division, team),
      // The key-bearing roster the saved lineup's assignment uses. The cheap
      // no-search endpoint — going through getTeamLineups here re-ran the whole
      // branch-and-bound solve for EVERY referenced team on every edit.
      getTeamRosterKeys(season, division, team),
    ]);
    return { lineups, roster };
  }
  const comparisons = await getSavedComparisons(season, division);

  // Every team we must resolve: the two picks + all teams referenced by saved
  // comparisons. Load each team's saved lineups + key-bearing roster once.
  const neededTeams = new Set<string>();
  for (const t of [a, b]) if (t) neededTeams.add(t);
  for (const c of comparisons) {
    neededTeams.add(c.team_a_code);
    neededTeams.add(c.team_b_code);
  }
  const teamData = new Map<
    string,
    { lineups: SavedLineup[]; roster: LineupPlayer[] | null }
  >();
  await Promise.all(
    [...neededTeams].map(async (t) => {
      teamData.set(t, await loadSide(t));
    }),
  );
  const emptySide = {
    lineups: [] as SavedLineup[],
    roster: null as LineupPlayer[] | null,
  };
  const sideAData = teamData.get(a) ?? emptySide;
  const sideBData = teamData.get(b) ?? emptySide;

  // One view per saved comparison, recomputed from the referenced lineups'
  // current state; a deleted side is marked rather than dropping the comparison.
  const comparisonViews = comparisons.map((c) => {
    const da = teamData.get(c.team_a_code);
    const db = teamData.get(c.team_b_code);
    const sa: ResolvedSide = {
      teamCode: c.team_a_code,
      lineup: da?.lineups.find((l) => l.id === c.lineup_a_id) ?? null,
      roster: da?.roster ?? null,
    };
    const sb: ResolvedSide = {
      teamCode: c.team_b_code,
      lineup: db?.lineups.find((l) => l.id === c.lineup_b_id) ?? null,
      roster: db?.roster ?? null,
    };
    return buildComparisonView(c, sa, sb, lineOrder);
  });

  function signaturesOf(data: {
    lineups: SavedLineup[];
    roster: LineupPlayer[] | null;
  }): Record<number, string> {
    const map: Record<number, string> = {};
    if (data.roster) {
      for (const l of data.lineups) {
        map[l.id] = lineupSignature(l, data.roster, lineOrder);
      }
    }
    return map;
  }
  const onSetNote = setLineNote.bind(null, season, division);
  const onDelete = deleteComparison.bind(null, season, division);
  const onSaveComparison = saveComparison.bind(null, season, division);

  // Confidential notes for both sides' players, one batch. Reaching here means
  // the viewer is unlocked (the gate above returned otherwise). Notes are shown
  // on BOTH sides — reading an opponent's notes is the point of scouting.
  const notesIds = [
    ...(sideAData.roster ?? []),
    ...(sideBData.roster ?? []),
  ].map((p) => p.player_id);
  const notesByPlayer: Record<number, PlayerNote[]> =
    notesIds.length > 0 ? await getPlayerNotesBatch(notesIds) : {};

  const lineupA = sideAData.lineups.find((l) => String(l.id) === al) ?? null;
  const lineupB = sideBData.lineups.find((l) => String(l.id) === bl) ?? null;

  // On-court preview for a selected side — shown as soon as one side is chosen,
  // without waiting for the other. Pure resolution, no fetch.
  const previewA =
    lineupA && sideAData.roster
      ? buildSidePreview(lineupA, sideAData.roster, lineOrder)
      : null;
  const previewB =
    lineupB && sideBData.roster
      ? buildSidePreview(lineupB, sideBData.roster, lineOrder)
      : null;

  function makeSide(
    lineup: SavedLineup | null,
    roster: LineupPlayer[] | null,
  ): CompareSide | null {
    if (!lineup || !roster) return null;
    const byKey = new Map<string, LineupPlayer>(roster.map((p) => [p.key, p]));
    return { savedLineup: lineup, byKey, notesByPlayer };
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

      {comparisonViews.length > 0 ? (
        <div className="flex-none border-b border-border bg-surface-muted px-5 py-3">
          <div className="mb-2 text-[11px] text-muted">已存对比</div>
          <CompareSavedCards
            views={comparisonViews}
            canEdit
            onSetNote={onSetNote}
            onDelete={onDelete}
          />
        </div>
      ) : null}

      <CompareControls
        teams={teamList}
        lineupsA={sideAData.lineups}
        lineupsB={sideBData.lineups}
        sel={{ a, al, b, bl }}
        signaturesA={signaturesOf(sideAData)}
        signaturesB={signaturesOf(sideBData)}
      />

      {previewA || previewB ? (
        <div className="flex flex-none gap-3 border-b border-border bg-surface-muted px-5 pb-3">
          <div className="min-w-0 flex-1">
            {previewA ? <SideLineupPreview lines={previewA} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            {previewB ? <SideLineupPreview lines={previewB} /> : null}
          </div>
        </div>
      ) : null}

      <CompareSaveBar selection={{ a, al, b, bl }} onSave={onSaveComparison} />

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

function Pair({
  cell,
}: {
  cell: {
    players: { name: string; gender: string | null; notes: PlayerNote[] }[];
    sum: string | null;
  };
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12.5px]">
        {cell.players.length === 0
          ? "—"
          : cell.players.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 ? <span className="text-muted-foreground">·</span> : null}
                <span>
                  {p.name}{" "}
                  <span className={`font-bold ${gcls(p.gender)}`}>
                    {gtoken(p.gender)}
                  </span>
                </span>
                <PlayerNotesBadges notes={p.notes} label={`${p.name} · 评价`} />
              </span>
            ))}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">线和 {cell.sum ?? "—"}</span>
    </div>
  );
}
