"use client";

import { useId, useState } from "react";

import type { LineupCandidate, LineupPlayer } from "@/lib/api";
import { playerName } from "@/lib/name";
import {
  GENDER_LABEL,
  estimateSentence,
  estimatesIn,
  hasOver,
  isEstimate,
  money,
  overOf,
} from "./candidate";

/**
 * The candidates as a compact list — the narrow-viewport form.
 *
 * Results lead; each set is one row (rank + total + a D1 signature + cost
 * flags), tapped open to the five lines stacked. Five aligned columns do not
 * fit at 375px and cross-set column-scanning is impossible on a phone anyway,
 * so this is a separate DOM from the desktop table (md:hidden), sharing the
 * same judgement helpers. The signature is the D1 pair — the marquee line, the
 * one that best tells tied sets apart in the collapsed state; the flags let a
 * costly set (an estimate, a line over cap) show before it is opened.
 */
export function CandidateRows({
  candidates,
  bufferTotal,
  lineOrder,
}: {
  candidates: LineupCandidate[];
  bufferTotal: string;
  lineOrder: string[];
}) {
  return (
    <ul
      role="list"
      data-testid="candidate-rows"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto md:hidden"
    >
      {candidates.map((candidate, index) => (
        <Row
          key={index}
          candidate={candidate}
          rank={index + 1}
          bufferTotal={bufferTotal}
          lineOrder={lineOrder}
        />
      ))}
    </ul>
  );
}

function Row({
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const estimates = estimatesIn(candidate);
  const over = hasOver(candidate);
  // The marquee line for the signature — D1 by name, falling back to the
  // first line if a division ever orders them differently.
  const signatureCode = candidate.lines["D1"] ? "D1" : lineOrder[0];
  const d1 = candidate.lines[signatureCode];

  return (
    <li className="border-b border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[52px] w-full items-center gap-2.5 px-3.5 py-2 text-left"
      >
        <span className="w-5 flex-none font-mono text-[11px] text-muted-foreground">
          {rank}
        </span>
        <span className="w-14 flex-none font-mono text-[17px] font-medium text-foreground">
          {candidate.total}
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-foreground">
          {d1 ? (
            <>
              <span className="font-mono text-[10px] text-muted-foreground">
                {signatureCode}{" "}
              </span>
              {playerName(d1[0])} · {playerName(d1[1])}
            </>
          ) : null}
        </span>
        <span className="flex flex-none items-center gap-1">
          {estimates > 0 ? (
            <span className="rounded-token border border-warning-border bg-warning-surface px-1 text-[10px] text-warning">
              含估算
            </span>
          ) : null}
          {over ? (
            <span className="rounded-token border border-danger-border bg-danger-surface px-1 text-[10px] text-danger">
              超 cap
            </span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          className={`flex-none text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path d="M6 3.5L10.5 8L6 12.5" />
        </svg>
      </button>

      {open ? (
        <div
          id={panelId}
          data-testid="candidate-lines"
          className="border-t border-border bg-surface-muted/40 px-3.5 pb-3 pt-1"
        >
          <div className="flex justify-end py-1 font-mono text-[11px] text-muted">
            buffer {money(candidate.buffer_spent)}/{money(bufferTotal)}
          </div>
          {lineOrder.map((code) => {
            const pair = candidate.lines[code];
            const lt = candidate.line_totals[code];
            if (!pair || !lt) return null;
            const lineOver = overOf(lt.over);
            return (
              <div
                key={code}
                className="flex items-baseline gap-2.5 border-b border-border py-1.5 last:border-b-0"
              >
                <span className="w-8 flex-none font-mono text-[10.5px] text-muted-foreground">
                  {code}
                </span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] text-foreground">
                  <Name player={pair[0]} /> · <Name player={pair[1]} />
                </span>
                <span className="flex-none font-mono text-[12px] text-muted">
                  {lt.total}
                  {lineOver ? (
                    <span className="text-danger"> 超 {lineOver}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {estimates > 0 ? (
            <p className="mt-2 rounded-token border border-warning-border bg-warning-surface px-2 py-1 text-[11px] leading-snug text-warning">
              {estimateSentence(estimates)}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
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
