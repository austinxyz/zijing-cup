import type {
  LineupCandidate,
  LineupPlayer,
  LineupSearch,
  RuleLine,
} from "@/lib/api";
import {
  BorrowedPlayersNotice,
  InvalidLocks,
  NoSolution,
  Truncated,
} from "./LineupStates";

interface LineupResultsProps {
  search: LineupSearch;
  /** The division's lines, so a blocked line can be named in words rather
   *  than by its code alone. */
  lines: RuleLine[];
  /** The whole-team buffer allowance, so a lineup's spend reads against
   *  something. Shown as a fraction because the budget is shared: 0.21 alone
   *  says nothing about how much room is left. */
  bufferTotal: string;
  /** Line order from the rules, so the five columns read D1…WD rather than
   *  in whatever order the object was built. */
  lineOrder: string[];
  /** The ceiling with nothing locked or excluded, when this search has
   *  constraints. What the locks cost is otherwise invisible. */
  unconstrainedCeiling?: string | null;
}

const GENDER_LABEL: Record<string, string> = { M: "男", F: "女" };

function name(player: LineupPlayer): string {
  return `${player.last_name}${player.first_name}`;
}

/** Two decimal places for display. Never used for a comparison — those all
 *  happen on the server, against exact decimals. */
function money(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

function difference(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  const gap = Number(b) - Number(a);
  if (!Number.isFinite(gap)) return null;
  return gap.toFixed(2);
}

function PlayerName({ player }: { player: LineupPlayer }) {
  return (
    <>
      {name(player)}
      {/* Gender is not decoration: the high-UTR limits are written per
          gender, so a lineup shown without it cannot be checked by eye. */}
      <span className="text-muted-foreground">
        {player.gender ? GENDER_LABEL[player.gender] ?? player.gender : "—"}
      </span>
    </>
  );
}

function CandidateCard({
  candidate,
  rank,
  bufferTotal,
  lineOrder,
}: {
  candidate: LineupCandidate;
  rank: number;
  bufferTotal: string;
  lineOrder: string[];
}) {
  return (
    <article className="flex items-stretch rounded-token border border-border bg-surface px-3 py-[11px]">
      <div className="flex w-24 flex-none flex-col gap-[3px] pr-2.5">
        <span className="font-mono text-[10px] text-muted-foreground">#{rank}</span>
        <span aria-label="总和" className="font-mono text-[15px] text-foreground">
          {candidate.total}
        </span>
        <span className="font-mono text-[10px] text-muted">
          {/* Both sides to the same two places. The backend sends an exact
              decimal, and "0/0.50" next to "0.21/0.50" reads as a different
              kind of number rather than the same one. Display only — every
              comparison happens on the server, where the value is a
              Decimal. */}
          buffer {money(candidate.buffer_spent)}/{money(bufferTotal)}
        </span>
      </div>
      {lineOrder.map((code) => {
        const pair = candidate.lines[code];
        const line = candidate.line_totals[code];
        if (!pair || !line) return null;
        const over = Number(line.over) > 0 ? line.over : null;
        return (
          <div
            key={code}
            className="flex min-w-0 flex-1 flex-col gap-[3px] border-l border-border px-2.5"
          >
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
              {code}
            </span>
            <span className="text-xs leading-snug text-foreground">
              <PlayerName player={pair[0]} /> + <PlayerName player={pair[1]} />
            </span>
            <span className="font-mono text-[11px] text-muted">
              {line.total}
              {over ? (
                <span className="font-mono text-[10px] text-[#b8860b]"> 超 {over}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </article>
  );
}

/**
 * The ceilings first, then the candidates.
 *
 * The order is deliberate: the top of the list is often a tie hundreds of
 * squads deep, so "how high can this team reach and how many ways are there
 * to get there" is a different question from "which lineup should I pick",
 * and only the first one has a single answer.
 */
export function LineupResults({
  search,
  lines,
  bufferTotal,
  lineOrder,
  unconstrainedCeiling,
}: LineupResultsProps) {
  const gapToRules = difference(search.ceiling, search.rules_ceiling);
  const costOfLocks = difference(search.ceiling, unconstrainedCeiling ?? null);

  // Three ways to have no candidates, and only one of them is "the search
  // ran and kept nothing". Each gets its own panel; none of them is rendered
  // as a list with zero rows.
  if (search.invalid_locks.length > 0) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        <InvalidLocks search={search} />
        <BorrowedPlayersNotice />
      </div>
    );
  }

  if (search.infeasible_line !== null) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        <NoSolution search={search} lines={lines} />
        <BorrowedPlayersNotice />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-5 py-4">
      {search.truncated ? <Truncated /> : null}
      <section
        aria-label="上限"
        className="flex flex-none flex-col gap-2 rounded-token border border-border bg-surface px-4 py-3.5"
      >
        <div className="flex items-baseline gap-4">
          <span className="flex flex-col gap-0.5">
            <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground">
              本队可达上限
            </span>
            <span className="font-mono text-[22px] font-medium text-foreground">
              {search.ceiling ?? "—"}
            </span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground">
              规则允许
            </span>
            <span className="font-mono text-[13px] text-muted">
              {/* null when a line is open: then the rules set no maximum at
                  all, and a number here would be one we invented. */}
              {search.rules_ceiling ?? "无上限"}
            </span>
          </span>
          {gapToRules ? (
            <span className="font-mono text-[11px] text-muted">差 {gapToRules}</span>
          ) : null}
        </div>

        <div className="text-[12.5px] leading-relaxed text-muted">
          达到这个上限的十人组合
          <strong>
            {search.squads_at_ceiling_exact
              ? `只有 ${search.squads_at_ceiling} 组`
              : `至少 ${search.squads_at_ceiling} 组`}
          </strong>
          {search.squads_at_ceiling === 1
            ? "——顶点没有可选的余地。"
            : "——顶点还有得选。"}
          下面 {search.candidates.length} 套是去重后的合法阵容（同一批十人换线不算两套），按总和从高到低。
        </div>

        {costOfLocks && Number(costOfLocks) !== 0 ? (
          // What the locks cost, computed against a second search with none
          // of them. Without it the ceiling looks like the team's ceiling
          // rather than the ceiling of the question that was asked.
          <div className="text-[12.5px] leading-relaxed text-muted">
            这些锁定与排除让上限从 {unconstrainedCeiling} 降到 {search.ceiling}
            ——锁定是有代价的，这里是 {costOfLocks}。
          </div>
        ) : null}
      </section>

      <div className="flex flex-none items-baseline justify-between">
        <span className="text-[12.5px] font-medium text-foreground">
          候选阵容 · 去重后 {search.candidates.length} 套
        </span>
      </div>

      {/* The list scrolls inside its own box. The shell is h-screen
          overflow-hidden, so a long list without this is silently cut off
          with no scrollbar to say there is more. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {search.candidates.map((candidate, index) => (
          <CandidateCard
            key={index}
            candidate={candidate}
            rank={index + 1}
            bufferTotal={bufferTotal}
            lineOrder={lineOrder}
          />
        ))}
      </div>

      <BorrowedPlayersNotice />
    </div>
  );
}
