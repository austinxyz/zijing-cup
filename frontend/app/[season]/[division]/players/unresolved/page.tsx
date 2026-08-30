import Link from "next/link";

import { getPlayersPage, type Player, type PlayerSeasonUtr } from "@/lib/api";
import { playerName } from "@/lib/name";
import { ruleOnSeason } from "./actions";

interface PageProps {
  params: Promise<{ season: string; division: string }>;
}

const GHOST =
  "flex h-7 items-center rounded-token border border-border bg-surface px-2.5 text-[11.5px] text-foreground";

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-border px-3 py-[7px] text-left font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-3 py-2 text-[12.5px] ${className}`}>
      {children}
    </td>
  );
}

/**
 * One contested season, with everything a ruling needs.
 *
 * Both numbers, the team each came from — the decision is "which sheet do I
 * believe", and team names are what makes that answerable — and the value
 * currently in use, so the conservative stand-in is visible on every row
 * rather than only in the banner.
 */
function Row({
  player,
  utr,
  season,
  division,
}: {
  player: Player;
  utr: PlayerSeasonUtr;
  season: string;
  division: string;
}) {
  const teamFor = (division: string | null) =>
    division === null
      ? null
      : (player.memberships.find(
          (m) => m.season_year === utr.season_year && m.division_code === division,
        )?.team_code ?? null);

  // Each candidate is placed by ITS OWN recorded origin. Sorting by size would
  // be wrong for half the real cases: in 2025 the larger number is gold for
  // Chen Yilun and silver for Zong Qingqing, so a size-based layout would tell
  // whoever is ruling the opposite of the truth about which sheet said what.
  const candidates: Record<string, { value: string; team: string | null }> = {};
  if (utr.value_division) {
    candidates[utr.value_division] = {
      value: utr.value,
      team: teamFor(utr.value_division),
    };
  }
  if (utr.alt_value && utr.alt_value_division) {
    candidates[utr.alt_value_division] = {
      value: utr.alt_value,
      team: teamFor(utr.alt_value_division),
    };
  }
  const known = utr.value_division !== null || utr.alt_value_division !== null;

  const hidden = (
    <>
      <input type="hidden" name="playerId" value={player.id} />
      <input type="hidden" name="seasonYear" value={utr.season_year} />
      <input type="hidden" name="season" value={season} />
      <input type="hidden" name="division" value={division} />
    </>
  );

  return (
    <tr>
      <Td>
        <Link
          href={`/${season}/${division}/players/${player.id}`}
          className="text-foreground no-underline hover:underline"
        >
          {playerName(player)}
        </Link>
      </Td>
      <Td className="font-mono text-muted-foreground">{utr.season_year}</Td>
      {["gold", "silver"].map((division) => (
        <Td key={division} className="font-mono">
          <span aria-label={division === "gold" ? "金组总表" : "银组总表"}>
            {candidates[division] ? (
              <>
                {candidates[division].value}{" "}
                <span className="text-[11px] text-muted-foreground">
                  {candidates[division].team ?? ""}
                </span>
              </>
            ) : known ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              // Nothing recorded either candidate's sheet: this conflict came
              // from merging two hand-made records. Printing a division here
              // would be inventing evidence for a decision.
              <span className="text-[11px] text-muted-foreground">来源未知</span>
            )}
          </span>
        </Td>
      ))}
      <Td>
        <span aria-label="当前采用" className="font-mono">
          {utr.value}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          {[utr.value, utr.alt_value].map((candidate) =>
            candidate ? (
              <form key={candidate} action={ruleOnSeason}>
                {hidden}
                <input type="hidden" name="value" value={candidate} />
                <button type="submit" className={GHOST}>
                  取 {candidate}
                </button>
              </form>
            ) : null,
          )}
          <form action={ruleOnSeason} className="flex items-center gap-1.5">
            {hidden}
            {/* A third value: the committee can issue a correction after both
                sheets were frozen, and two wrong options would only launder
                the error. */}
            <input
              name="value"
              aria-label="填别的"
              placeholder="填别的"
              inputMode="decimal"
              className="h-7 w-[86px] rounded-token border border-border bg-surface px-2 font-mono text-[11.5px] text-foreground"
            />
            <button type="submit" className={GHOST}>
              裁决
            </button>
          </form>
        </div>
      </Td>
    </tr>
  );
}

export default async function UnresolvedPage({ params }: PageProps) {
  const { season, division } = await params;

  const page = await getPlayersPage({ unresolved: true, limit: 500 });
  const rows = page.players.flatMap((player) =>
    player.season_utrs
      .filter((utr) => utr.is_unresolved)
      .map((utr) => ({ player, utr })),
  );

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-base font-semibold text-foreground">未裁决的参赛 UTR</h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            {page.total} 条 · 两份总表分别冻结，取样时点不同
          </span>
        </div>
        {rows.length > 0 ? (
          // Present but quiet: confirming every row at once turns a
          // conservative estimate into a stated fact, which is a different
          // claim and should not look like the default action.
          <button type="button" className={GHOST} disabled>
            全部按较大值确认…
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 px-5 py-4">
        <section
          aria-label="取值说明"
          className="flex-none rounded-token border border-warning-border bg-warning-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-[#6f5206]"
        >
          这些队员在两个组别的总表里被记了不同的参赛 UTR。裁决之前一律
          <strong>按较大值</strong>参与排阵计算，因此现在的结果是<strong>保守</strong>
          的：可能少给几套本来合法的阵容，但不会把违规的显示成合法。
        </section>

        {rows.length === 0 ? (
          <div className="rounded-token border border-border bg-surface px-4 py-6 text-center text-[12.5px] text-muted">
            没有待裁决的参赛 UTR。
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-token border border-border bg-surface">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>队员</Th>
                  <Th className="w-[70px]">赛季</Th>
                  <Th className="w-[170px]">金组总表</Th>
                  <Th className="w-[170px]">银组总表</Th>
                  <Th className="w-[90px]">当前采用</Th>
                  <Th>裁决</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ player, utr }) => (
                  <Row
                    key={`${player.id}-${utr.season_year}`}
                    player={player}
                    utr={utr}
                    season={season}
                    division={division}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
