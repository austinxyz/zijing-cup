import { formatWinLoss, isHotHand } from "@/lib/winLoss";

import { money, overOf } from "./candidate";

/** One seat in a line block: a player's display name, gender, participation
 *  UTR (string; "" when there is none), and whether that UTR is a derived
 *  estimate. Numbers are the backend's — shown, never compared. */
export interface LineSeat {
  name: string;
  gender: string | null;
  utr: string;
  estimate: boolean;
  /** A borrowed ("外援") player — marked distinctly so the on-court borrowed
   *  count is visible at a glance. */
  borrowed?: boolean;
  /** Career win/loss. Display only: a hot-hand marker (win rate ≥ 60%) plus a
   *  win-rate hover on every seat. null/absent = never imported (NOT 0-0). */
  wins?: number | null;
  losses?: number | null;
}

interface LineBlockProps {
  line: string;
  /** The line's participation-UTR sum; omitted when there is nothing to total. */
  total?: string;
  cap?: string | null;
  /** The line's buffer occupancy (over-cap amount, "0" when within cap). */
  over?: string;
  seats: [LineSeat, LineSeat];
}

/**
 * One line as a three-row block: a header (line code + sum + buffer occupancy)
 * and one row per player (gender symbol + name + UTR). Shared by candidates and
 * saved lineups so both read identically. An over-cap line is tinted danger.
 */
export function LineBlock({ line, total, over, seats }: LineBlockProps) {
  const o = over != null ? overOf(over) : null;
  return (
    <div
      aria-label={line}
      className={`flex min-w-0 flex-col overflow-hidden rounded-token border ${
        o ? "border-danger-border bg-danger-surface" : "border-border"
      }`}
    >
      <div className="flex items-baseline justify-between gap-1 bg-surface-muted px-2 py-1">
        <span className="font-mono text-[9.5px] text-muted">{line}</span>
        {total !== undefined ? (
          <span className="font-mono text-[9.5px] text-muted-foreground">
            和 {money(total)}
            {o ? <span className="text-danger"> 超 {money(o)}</span> : null}
          </span>
        ) : null}
      </div>
      {seats.map((s, i) => {
        const wl = formatWinLoss(s.wins ?? null, s.losses ?? null);
        const hot = isHotHand(s.wins, s.losses);
        // Every seat gets a win-rate hover; the record already reads "—" when
        // never imported, so it is never a blank or a misleading 0-0/0%.
        const winTip = `胜率 ${wl.record}${wl.rate ? ` · ${wl.rate}` : ""}`;
        return (
          <div
            key={i}
            title={winTip}
            className={`flex items-baseline gap-1.5 border-t border-border/60 px-2 py-1 text-[11.5px] ${
              s.borrowed ? "bg-borrowed-surface" : ""
            }`}
          >
            <GenderMark gender={s.gender} />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {s.name}
              {s.borrowed ? (
                <span title="外援" className="ml-0.5 text-borrowed">
                  外
                </span>
              ) : null}
              {hot ? (
                // A hot hand: win rate ≥ 60%. `text-success` green ▲, distinct
                // from the borrowed 外 and the estimate 估. The record is on the
                // row hover; this is the at-a-glance mark.
                <span title={`状态好 · ${winTip}`} className="ml-0.5 text-success">
                  ▲
                </span>
              ) : null}
              {s.estimate ? (
                <span title="估算值" className="ml-0.5 text-warning">
                  估
                </span>
              ) : null}
            </span>
            <span className="flex-none font-mono text-[10.5px] text-muted-foreground">
              {s.utr ? money(s.utr) : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Gender as a symbol: ♂ / ♀, or a neutral dash when unknown. Coloured by its
 *  own tokens (measured ≥4.5:1 against the surfaces it sits on). */
export function GenderMark({ gender }: { gender: string | null }) {
  if (gender === "M")
    return <span className="w-3 flex-none text-center text-male">♂</span>;
  if (gender === "F")
    return <span className="w-3 flex-none text-center text-female">♀</span>;
  return <span className="w-3 flex-none text-center text-muted">—</span>;
}
