import type { MatchRecord } from "@/lib/api";

/**
 * 历史对局 region on the compare page: our side's recorded ties against the
 * selected opponent, with a win/loss tally. Admin-only (the whole compare page
 * is canEdit-gated); the data is fetched server-side and degrades to [] when the
 * match_records table is not yet built, so this region simply shows the empty
 * state rather than taking the page down.
 *
 * A match stores only a nullable `source_lineup_id` (a reference, no snapshot of
 * the name). The lineup name is resolved at read time from the saved lineups the
 * compare page already loaded (`lineupNames`), honoring the design's "store a
 * reference, resolve on read, degrade when it is gone": an ad-hoc tie (no source)
 * or a since-deleted lineup simply shows no name rather than a fabricated one.
 */

interface Props {
  opponent: string;
  matches: MatchRecord[];
  /** saved_lineup id -> name, from the lineups the page already loaded. */
  lineupNames: Record<number, string>;
}

export function CompareHistory({ opponent, matches, lineupNames }: Props) {
  // A tie is neither a win nor a loss — strict comparison, not `>=` (gold's
  // points mode can tie; counting that as a win would overstate the record).
  const wins = matches.filter((m) => m.outcome.our > m.outcome.opponent).length;
  const losses = matches.filter((m) => m.outcome.our < m.outcome.opponent).length;

  return (
    <details
      open
      className="flex-none border-b border-border bg-surface-muted px-5 py-3"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <b className="text-[12.5px] font-semibold">历史对局</b>
        <span className="rounded-full border border-border bg-surface px-2 text-[10.5px] text-muted-foreground">
          对 {opponent}
          {matches.length > 0 ? ` · ${matches.length} 场` : ""}
        </span>
        {matches.length > 0 && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {wins} 胜 {losses} 负
          </span>
        )}
      </summary>
      <div className="pt-2">
        {matches.length === 0 ? (
          <p className="text-[12px] italic text-muted-foreground">
            我方还没录过对这支队的比赛。
          </p>
        ) : (
          matches.map((m) => {
            const won = m.outcome.our > m.outcome.opponent;
            const tied = m.outcome.our === m.outcome.opponent;
            const lineupName =
              m.source_lineup_id != null ? lineupNames[m.source_lineup_id] : undefined;
            return (
              <div
                key={m.id}
                className="mb-1.5 flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-[9px]"
              >
                <span className="w-[84px] flex-none font-mono text-[11px] text-muted-foreground">
                  {m.match_date}
                </span>
                <span className="flex-1 text-[12.5px]">
                  <b className="font-semibold">
                    {lineupName ?? m.our_team_code}
                  </b>
                  {m.round_label && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      · {m.round_label}
                    </span>
                  )}
                </span>
                <span
                  className={`flex-none font-mono text-[13px] font-semibold ${
                    tied ? "text-muted-foreground" : won ? "text-success" : "text-danger"
                  }`}
                >
                  {tied ? "平" : won ? "胜" : "负"} {m.outcome.our}–{m.outcome.opponent}
                </span>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
