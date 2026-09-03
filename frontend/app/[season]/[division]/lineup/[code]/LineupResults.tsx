import type { LineupSearch, RuleLine } from "@/lib/api";
import type { SaveLineupAction } from "./SaveLineupButton";
import {
  BorrowedPlayersNotice,
  InvalidLocks,
  MissingUtrNotice,
  NoSolution,
  Truncated,
  UnresolvedNotice,
} from "./LineupStates";
import { CandidateTable } from "./CandidateTable";
import { CandidateRows } from "./CandidateRow";
import { estimatesIn } from "./candidate";

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
  /** Admin: enables the per-candidate 「保存此阵容」 entry. UI only — the write
   *  route is method-gated. */
  canEdit?: boolean;
  /** Server action bound to (season,division,team); a candidate row supplies
   *  the name and assignment. A server action is serializable across the
   *  server→client boundary — a plain render function is NOT, which is why the
   *  tables build the button from data rather than being handed a node. */
  saveAction?: SaveLineupAction;
}

function difference(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return null;
  const gap = Number(b) - Number(a);
  if (!Number.isFinite(gap)) return null;
  return gap.toFixed(2);
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
  canEdit,
  saveAction,
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
      <UnresolvedNotice count={search.unresolved_count} />
      <MissingUtrNotice count={search.missing_utr_count} />
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
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[22px] font-medium text-foreground">
                {search.ceiling ?? "—"}
              </span>
              {/* The one number most likely to be quoted on its own, so it
                  carries the caveat with it. */}
              {search.candidates.length > 0 &&
              estimatesIn(search.candidates[0]) > 0 ? (
                <span className="rounded-token border border-warning-border bg-warning-surface px-1.5 py-px text-[10.5px] text-warning">
                  含估算值
                </span>
              ) : null}
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

      {/* Wide viewport: a comparison table (candidates as rows, lines as
          aligned columns). Each surface owns its own scroll — the shell is
          overflow-hidden, so a long list without it is silently cut off. */}
      <CandidateTable
        candidates={search.candidates}
        bufferTotal={bufferTotal}
        lineOrder={lineOrder}
        canEdit={canEdit}
        saveAction={saveAction}
      />
      {/* Narrow viewport: the same candidates as a compact, tappable list. */}
      <CandidateRows
        candidates={search.candidates}
        bufferTotal={bufferTotal}
        lineOrder={lineOrder}
        canEdit={canEdit}
        saveAction={saveAction}
      />

      <BorrowedPlayersNotice />
    </div>
  );
}
