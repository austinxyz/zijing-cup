import type { ReactNode } from "react";

import type { LineupCandidate, LineupPlayer } from "@/lib/api";
import { playerName } from "@/lib/name";
import {
  GENDER_LABEL,
  estimateSentence,
  estimatesIn,
  isEstimate,
  money,
  overOf,
} from "./candidate";

/**
 * The candidates as one comparison table — the wide-viewport form.
 *
 * A real <table> with table-fixed, not a flex band: aligning a line across
 * rows (scan the D1 column down the list) needs identical column widths, and
 * flex rows each size themselves. Long names truncate inside their fixed cell
 * rather than wrapping (which would raise the row and break the alignment) or
 * widening the table (which would push it past the viewport).
 *
 * Estimate markers are compact here — a `˟` on the number, a `估` badge on the
 * set — with the full wording in the legend below. The marker is on every
 * estimated number and every estimated set; only the sentence moves to one
 * place instead of repeating per row.
 */
export function CandidateTable({
  candidates,
  bufferTotal,
  lineOrder,
  saveEntry,
}: {
  candidates: LineupCandidate[];
  bufferTotal: string;
  lineOrder: string[];
  /** Admin save control per row; absent for a visitor (no column shown). */
  saveEntry?: (candidate: LineupCandidate) => ReactNode;
}) {
  const anyEstimate = candidates.some((c) => estimatesIn(c) > 0);

  return (
    <div className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full table-fixed border-collapse bg-surface text-left">
          <colgroup>
            <col className="w-[38px]" />
            <col className="w-[66px]" />
            <col className="w-[78px]" />
            {lineOrder.map((code) => (
              <col key={code} />
            ))}
            {saveEntry ? <col className="w-[128px]" /> : null}
          </colgroup>
          <thead>
            <tr>
              <Th className="text-right">#</Th>
              <Th className="text-right">总和</Th>
              <Th>buffer</Th>
              {lineOrder.map((code) => (
                <Th key={code}>{code}</Th>
              ))}
              {saveEntry ? <Th className="text-right">保存</Th> : null}
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => {
              const estimates = estimatesIn(candidate);
              return (
                <tr key={index} className="hover:bg-surface-muted/60">
                  <Td className="text-right font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </Td>
                  <Td className="text-right font-mono text-[14px] font-medium">
                    {candidate.total}
                    {estimates > 0 ? (
                      <span
                        title={estimateSentence(estimates)}
                        className="ml-1 inline-block rounded-full border border-warning-border bg-warning-surface px-1 text-[9px] leading-[1.4] text-warning"
                      >
                        估
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-right font-mono text-[11px] text-muted">
                    {money(candidate.buffer_spent)}/{money(bufferTotal)}
                  </Td>
                  {lineOrder.map((code) => {
                    const pair = candidate.lines[code];
                    const lt = candidate.line_totals[code];
                    if (!pair || !lt) return <Td key={code}>—</Td>;
                    const over = overOf(lt.over);
                    return (
                      <Td key={code}>
                        <div
                          // The cell truncates a long pair; title keeps the
                          // full names recoverable on hover (contract D1).
                          title={`${playerName(pair[0])} · ${playerName(pair[1])}`}
                          className="truncate whitespace-nowrap text-[12px] text-foreground"
                        >
                          <PairName pair={pair} />
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {lt.total}
                          {over ? (
                            <span className="text-danger"> 超 {over}</span>
                          ) : null}
                        </div>
                      </Td>
                    );
                  })}
                  {saveEntry ? (
                    <td className="h-10 overflow-visible border-b border-border px-2.5 text-right align-middle">
                      {saveEntry(candidate)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyEstimate ? (
        <div className="flex flex-none flex-wrap gap-x-4 gap-y-1 border-t border-border bg-surface-muted px-3.5 py-2 text-[11px] text-muted">
          <span>
            <span className="text-warning">˟</span> 名字后 = 该数字是估算值
          </span>
          <span>
            <span className="rounded-full border border-warning-border bg-warning-surface px-1 text-[9px] text-warning">
              估
            </span>{" "}
            总和旁 = 整套含估算值，合法性待总表确认
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PairName({ pair }: { pair: [LineupPlayer, LineupPlayer] }) {
  return (
    <>
      <Name player={pair[0]} /> · <Name player={pair[1]} />
    </>
  );
}

function Name({ player }: { player: LineupPlayer }) {
  return (
    <>
      {playerName(player)}
      {isEstimate(player) ? (
        <span title="估算值" className="font-semibold text-warning">
          ˟
        </span>
      ) : null}
      <span className="text-[10px] text-muted">
        {" "}
        {player.gender ? GENDER_LABEL[player.gender] ?? player.gender : "—"}
      </span>
    </>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-10 h-[34px] whitespace-nowrap border-b border-border bg-surface-muted px-2.5 font-mono text-[11px] font-medium text-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`h-10 overflow-hidden border-b border-border px-2.5 align-middle ${className}`}
    >
      {children}
    </td>
  );
}
