import type { LineupCandidate } from "@/lib/api";
import { playerName } from "@/lib/name";
import { estimateSentence, estimatesIn, isEstimate, money } from "./candidate";
import { LineBlock, type LineSeat } from "./LineBlock";
import { SaveLineupButton, type SaveLineupAction } from "./SaveLineupButton";

interface CandidateCardsProps {
  candidates: LineupCandidate[];
  bufferTotal: string;
  lineOrder: string[];
  canEdit?: boolean;
  saveAction?: SaveLineupAction;
}

function seatOf(player: LineupCandidate["lines"][string][number]): LineSeat {
  return {
    name: playerName(player),
    gender: player.gender,
    utr: player.match_utr,
    estimate: isEstimate(player),
    borrowed: player.is_borrowed_player === true,
    wins: player.wins ?? null,
    losses: player.losses ?? null,
  };
}

/**
 * The candidates as cards — one per set, each showing its five lines as the
 * shared three-row LineBlock (five blocks in a row, folding to two columns on a
 * phone). The same block the saved-lineups list uses, so a candidate and a
 * saved lineup read identically.
 *
 * The estimate marker rides on each derived number (LineBlock's `估`); the full
 * sentence lives on the set-level 含估算 badge's title, so it stays reachable
 * without repeating on every row.
 */
export function CandidateCards({
  candidates,
  bufferTotal,
  lineOrder,
  canEdit,
  saveAction,
}: CandidateCardsProps) {
  return (
    <div role="list" data-testid="candidate-cards" className="flex flex-col gap-4">
      {candidates.map((candidate, index) => {
        const estimates = estimatesIn(candidate);
        return (
          <article
            key={index}
            role="listitem"
            aria-label={`候选 ${index + 1}`}
            className="flex flex-col gap-2 rounded-token border border-border bg-surface px-4 py-3"
          >
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                #{index + 1}
              </span>
              <span className="font-mono text-[15px] font-medium text-foreground">
                {money(candidate.total)}
              </span>
              {estimates > 0 ? (
                <span
                  title={estimateSentence(estimates)}
                  className="rounded-full border border-warning-border bg-warning-surface px-1.5 text-[10px] text-warning"
                >
                  含估算
                </span>
              ) : null}
              <span className="flex-1" />
              {canEdit ? (
                <SaveLineupButton
                  candidate={candidate}
                  canEdit
                  saveAction={saveAction}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {lineOrder.map((code) => {
                const pair = candidate.lines[code];
                const lt = candidate.line_totals[code];
                if (!pair || !lt) return null;
                return (
                  <LineBlock
                    key={code}
                    line={code}
                    total={lt.total}
                    cap={lt.cap}
                    over={lt.over}
                    seats={[seatOf(pair[0]), seatOf(pair[1])]}
                  />
                );
              })}
            </div>

            <span className="font-mono text-[10.5px] text-muted">
              全队 buffer {money(candidate.buffer_spent)} / {money(bufferTotal)}
            </span>
          </article>
        );
      })}
    </div>
  );
}
