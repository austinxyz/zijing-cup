"use client";

import { useMemo, useState } from "react";

import type { MatchLinePlayer, MatchRecord } from "@/lib/api";

/**
 * Admin-only match history: a filterable list of recorded ties, each expandable
 * to per-line detail (both sides' on-court players + win/loss + note). The whole
 * data set is loaded by the server page; filtering is client-side (a division
 * holds at most tens of matches).
 */

interface TeamRef {
  code: string;
  display_name: string | null;
}

interface Props {
  season: string;
  division: string;
  teams: TeamRef[];
  matches: MatchRecord[];
  canEdit: boolean;
  onDelete: (id: number) => Promise<void>;
}

/** "未记录" for an unresolved slot — never a blank or a zero. */
function playerName(p: MatchLinePlayer | null): string {
  if (p === null) return "未记录";
  return [p.last_name, p.first_name].filter(Boolean).join(" ") || "未记录";
}

function gcls(g: string | null | undefined): string {
  return g === "M"
    ? "text-[#1f5fd0]"
    : g === "F"
      ? "text-[#ab237f]"
      : "text-muted-foreground";
}
function gtoken(g: string | null | undefined): string {
  return g === "M" ? "♂" : g === "F" ? "♀" : "·";
}

function Side({ players }: { players: (MatchLinePlayer | null)[] }) {
  return (
    <span className="whitespace-nowrap">
      {players.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {playerName(p)}
          {p && (
            <span className={gcls(p.gender)}> {gtoken(p.gender)}</span>
          )}
        </span>
      ))}
    </span>
  );
}

function outcomeLabel(m: MatchRecord): { text: string; won: boolean } {
  const { our, opponent } = m.outcome;
  return { text: `${our}–${opponent}`, won: our >= opponent };
}

export function MatchHistory({
  season,
  division,
  teams,
  matches,
  canEdit,
  onDelete,
}: Props) {
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    if (!filter) return matches;
    return matches.filter(
      (m) => m.our_team_code === filter || m.opponent_team_code === filter,
    );
  }, [filter, matches]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center gap-3 border-b border-border bg-surface-muted px-5 py-[10px]">
        <label htmlFor="match-team-filter" className="text-[11px] text-muted">
          按队伍筛选
        </label>
        <select
          id="match-team-filter"
          aria-label="按队伍筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-[30px] max-w-[220px] rounded-md border border-border bg-surface px-2 text-[12px] text-foreground"
        >
          <option value="">全部队伍</option>
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.display_name ?? t.code}
            </option>
          ))}
        </select>
        {canEdit && (
          <a
            href={`/${season}/${division}/matches/new`}
            className="ml-auto rounded-md border border-primary bg-primary px-3 py-[5px] text-[12px] text-primary-foreground"
          >
            录入比赛
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {shown.length === 0 ? (
          <p className="text-[12px] italic text-muted-foreground">
            还没有录入过比赛。
          </p>
        ) : (
          shown.map((m) => {
            const res = outcomeLabel(m);
            return (
              <details
                key={m.id}
                className="mb-2 rounded-lg border border-border bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-[9px]">
                  <span className="w-[84px] flex-none font-mono text-[11px] text-muted-foreground">
                    {m.match_date}
                  </span>
                  <span className="flex-1 text-[12.5px]">
                    <b className="font-semibold">{m.our_team_code}</b>
                    {" vs "}
                    {m.opponent_team_code}
                    {m.round_label && (
                      <span className="ml-1.5 rounded-full border border-border bg-surface-muted px-2 text-[10.5px] text-muted-foreground">
                        {m.round_label}
                      </span>
                    )}
                  </span>
                  <span
                    className={`flex-none font-mono text-[13px] font-semibold ${
                      res.won ? "text-success" : "text-danger"
                    }`}
                  >
                    {res.won ? "胜" : "负"} {res.text}
                  </span>
                </summary>
                <div className="px-3 pb-3">
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr>
                        <th className="w-[42px] border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">
                          线
                        </th>
                        <th className="border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">
                          我方
                        </th>
                        <th className="border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">
                          对手
                        </th>
                        <th className="w-[60px] border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">
                          结果
                        </th>
                        <th className="border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">
                          备注
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(m.lines).map(([code, line]) => (
                        <tr key={code}>
                          <td className="border-b border-border/60 px-2.5 py-[7px] font-mono text-[11px] font-semibold text-muted-foreground">
                            {code}
                          </td>
                          <td className="border-b border-border/60 px-2.5 py-[7px]">
                            <Side players={line.our_players} />
                          </td>
                          <td className="border-b border-border/60 px-2.5 py-[7px]">
                            <Side players={line.opp_players} />
                          </td>
                          <td className="border-b border-border/60 px-2.5 py-[7px]">
                            <b
                              className={`font-semibold ${
                                line.outcome === "win" ? "text-success" : "text-danger"
                              }`}
                            >
                              {line.outcome === "win" ? "胜" : "负"}
                            </b>
                          </td>
                          <td className="border-b border-border/60 px-2.5 py-[7px] text-[11px] text-muted-foreground">
                            {line.note}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onDelete(m.id)}
                      className="mt-2 rounded-md border border-border bg-surface px-2.5 py-[3px] text-[11px] text-danger"
                    >
                      删除
                    </button>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>
    </div>
  );
}
