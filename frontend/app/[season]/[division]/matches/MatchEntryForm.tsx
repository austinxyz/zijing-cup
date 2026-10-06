"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { LineupPlayer, SavedLineup } from "@/lib/api";

import { createMatch, type MatchInput } from "./actions";

/**
 * Admin match-entry form. Our-side players are chosen from the selected team's
 * roster (optionally prefilled from one of its saved lineups, then adjustable);
 * opponent players from the opponent roster, with a "未记录" option that stores
 * null. Each line gets a win/loss toggle + note; the whole-tie outcome is shown
 * live (same rule the backend derives, mirrored here only for feedback).
 */

interface TeamRef {
  code: string;
  display_name: string | null;
}
interface LineRef {
  code: string;
  kind: string;
  points: number;
}

interface Props {
  season: string;
  division: string;
  teams: TeamRef[];
  lineOrder: LineRef[];
  scoringMode: string;
  rostersByTeam: Record<string, LineupPlayer[]>;
  savedByTeam: Record<string, SavedLineup[]>;
}

type Outcome = "" | "win" | "loss";
interface LineState {
  our: [string, string];
  opp: [string, string]; // "" = 未记录 (stored null)
  outcome: Outcome;
  note: string;
}

function emptyLine(): LineState {
  return { our: ["", ""], opp: ["", ""], outcome: "", note: "" };
}

function label(p: LineupPlayer): string {
  const name = [p.last_name, p.first_name].filter(Boolean).join(" ");
  const g = p.gender === "M" ? "♂" : p.gender === "F" ? "♀" : "·";
  return `${name} ${g} ${p.match_utr}`;
}

export function MatchEntryForm({
  season,
  division,
  teams,
  lineOrder,
  scoringMode,
  rostersByTeam,
  savedByTeam,
}: Props) {
  const router = useRouter();
  const [ourTeam, setOurTeam] = useState("");
  const [oppTeam, setOppTeam] = useState("");
  const [date, setDate] = useState("");
  const [round, setRound] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(lineOrder.map((l) => [l.code, emptyLine()])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ourRoster = rostersByTeam[ourTeam] ?? [];
  const oppRoster = rostersByTeam[oppTeam] ?? [];
  const savedLineups = savedByTeam[ourTeam] ?? [];

  function setLine(code: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  function prefill(lineupId: string) {
    setSourceId(lineupId);
    const lineup = savedLineups.find((l) => String(l.id) === lineupId);
    if (!lineup) return;
    setLines((prev) => {
      const next = { ...prev };
      for (const l of lineOrder) {
        const seats = lineup.assignment[l.code] ?? [];
        next[l.code] = {
          ...next[l.code],
          our: [seats[0] ?? "", seats[1] ?? ""],
        };
      }
      return next;
    });
  }

  const outcome = useMemo(() => {
    let our = 0;
    let opp = 0;
    for (const l of lineOrder) {
      const st = lines[l.code];
      if (st.outcome !== "win" && st.outcome !== "loss") continue;
      const w = scoringMode === "points" ? l.points : 1;
      if (st.outcome === "win") our += w;
      else opp += w;
    }
    return { our, opp };
  }, [lines, lineOrder, scoringMode]);

  function assemble(): MatchInput {
    const out: MatchInput["lines"] = {};
    for (const l of lineOrder) {
      const st = lines[l.code];
      if (st.outcome !== "win" && st.outcome !== "loss") continue;
      out[l.code] = {
        our: [st.our[0], st.our[1]],
        opp: [
          st.opp[0] === "" ? null : Number(st.opp[0]),
          st.opp[1] === "" ? null : Number(st.opp[1]),
        ],
        outcome: st.outcome,
        note: st.note,
      };
    }
    return {
      our_team_code: ourTeam,
      opponent_team_code: oppTeam,
      match_date: date,
      round_label: round.trim() || null,
      source_lineup_id: sourceId === "" ? null : Number(sourceId),
      lines: out,
    };
  }

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      await createMatch(season, division, assemble());
      router.push(`/${season}/${division}/matches`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      setSaving(false);
    }
  }

  function PlayerSelect({
    id, value, options, onChange, allowBlank,
  }: {
    id: string;
    value: string;
    options: LineupPlayer[];
    onChange: (v: string) => void;
    allowBlank: boolean;
  }) {
    return (
      <select
        aria-label={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[28px] w-full rounded-md border border-border bg-surface px-1.5 text-[12px] text-foreground"
      >
        <option value="">{allowBlank ? "— 未记录" : "— 选择"}</option>
        {options.map((p) => (
          <option key={p.key} value={allowBlank ? String(p.player_id) : p.key}>
            {label(p)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background p-5">
      <div className="mb-3.5 flex flex-wrap gap-3.5">
        <div className="min-w-[150px] flex-1">
          <label htmlFor="our-team" className="mb-1 block text-[11px] text-muted">
            我方队伍
          </label>
          <select
            id="our-team" aria-label="我方队伍" value={ourTeam}
            onChange={(e) => { setOurTeam(e.target.value); setSourceId(""); }}
            className="h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12px]"
          >
            <option value="">— 选择</option>
            {teams.map((t) => (
              <option key={t.code} value={t.code}>{t.display_name ?? t.code}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px] flex-1">
          <label htmlFor="opp-team" className="mb-1 block text-[11px] text-muted">
            对手队伍
          </label>
          <select
            id="opp-team" aria-label="对手队伍" value={oppTeam}
            onChange={(e) => setOppTeam(e.target.value)}
            className="h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12px]"
          >
            <option value="">— 选择</option>
            {teams.filter((t) => t.code !== ourTeam).map((t) => (
              <option key={t.code} value={t.code}>{t.display_name ?? t.code}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[150px] flex-1">
          <label htmlFor="match-date" className="mb-1 block text-[11px] text-muted">
            日期 *
          </label>
          <input
            id="match-date" aria-label="比赛日期" type="date" value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12px]"
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label htmlFor="round" className="mb-1 block text-[11px] text-muted">
            轮次（可选）
          </label>
          <input
            id="round" aria-label="轮次" value={round} placeholder="如 小组赛第2轮"
            onChange={(e) => setRound(e.target.value)}
            className="h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12px]"
          />
        </div>
        <div className="flex min-w-[150px] flex-1 items-end">
          <div className="w-full">
            <label htmlFor="prefill" className="mb-1 block text-[11px] text-muted">
              复制自已存阵容
            </label>
            <select
              id="prefill" aria-label="复制自已存阵容" value={sourceId}
              onChange={(e) => prefill(e.target.value)}
              disabled={!ourTeam}
              className="h-[30px] w-full rounded-md border border-border bg-surface px-2 text-[12px]"
            >
              <option value="">—</option>
              {savedLineups.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="w-[42px] border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">线</th>
            <th className="border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">我方上场</th>
            <th className="border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">对手上场</th>
            <th className="w-[118px] border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">结果</th>
            <th className="w-[150px] border-b border-border bg-surface-muted px-2.5 py-[7px] text-left font-mono text-[10.5px] text-muted-foreground">备注</th>
          </tr>
        </thead>
        <tbody>
          {lineOrder.map((l) => {
            const st = lines[l.code];
            return (
              <tr key={l.code}>
                <td className="border-b border-border/60 px-2.5 py-[7px] align-top font-mono text-[11px] font-semibold text-muted-foreground">
                  {l.code}
                </td>
                <td className="border-b border-border/60 px-2.5 py-[7px]">
                  <div className="flex flex-col gap-1">
                    <PlayerSelect id={`${l.code} 我方球员1`} value={st.our[0]} options={ourRoster}
                      allowBlank={false} onChange={(v) => setLine(l.code, { our: [v, st.our[1]] })} />
                    <PlayerSelect id={`${l.code} 我方球员2`} value={st.our[1]} options={ourRoster}
                      allowBlank={false} onChange={(v) => setLine(l.code, { our: [st.our[0], v] })} />
                  </div>
                </td>
                <td className="border-b border-border/60 px-2.5 py-[7px]">
                  <div className="flex flex-col gap-1">
                    <PlayerSelect id={`${l.code} 对手球员1`} value={st.opp[0]} options={oppRoster}
                      allowBlank onChange={(v) => setLine(l.code, { opp: [v, st.opp[1]] })} />
                    <PlayerSelect id={`${l.code} 对手球员2`} value={st.opp[1]} options={oppRoster}
                      allowBlank onChange={(v) => setLine(l.code, { opp: [st.opp[0], v] })} />
                  </div>
                </td>
                <td className="border-b border-border/60 px-2.5 py-[7px] align-top">
                  <div className="inline-flex gap-1">
                    <button type="button" aria-label={`${l.code} 胜`}
                      onClick={() => setLine(l.code, { outcome: st.outcome === "win" ? "" : "win" })}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                        st.outcome === "win"
                          ? "border-success-border bg-success-surface font-semibold text-success"
                          : "border-border bg-surface text-muted-foreground"
                      }`}>胜</button>
                    <button type="button" aria-label={`${l.code} 负`}
                      onClick={() => setLine(l.code, { outcome: st.outcome === "loss" ? "" : "loss" })}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                        st.outcome === "loss"
                          ? "border-danger-border bg-danger-surface font-semibold text-danger"
                          : "border-border bg-surface text-muted-foreground"
                      }`}>负</button>
                  </div>
                </td>
                <td className="border-b border-border/60 px-2.5 py-[7px] align-top">
                  <input aria-label={`${l.code} 备注`} value={st.note}
                    onChange={(e) => setLine(l.code, { note: e.target.value })}
                    className="h-[26px] w-full rounded-md border border-border bg-surface px-1.5 text-[11px]" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5">
        <span className="text-[12px]">整场（自动）：</span>
        <b data-testid="live-outcome" className="font-mono text-[15px]">
          <span className="text-success">{outcome.our}</span>
          <span className="text-muted-foreground"> – </span>
          <span className="text-danger">{outcome.opp}</span>
        </b>
        <span className="font-mono text-[11px] text-muted-foreground">
          {scoringMode === "points" ? "按线位 points 加权" : "按银组数赢线"} · 从逐线算
        </span>
      </div>

      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}

      <div className="mt-3.5 flex gap-2">
        <button type="button" onClick={submit} disabled={saving}
          className="rounded-md border border-primary bg-primary px-3 py-[6px] text-[12px] text-primary-foreground disabled:opacity-60">
          保存比赛
        </button>
        <button type="button" onClick={() => router.push(`/${season}/${division}/matches`)}
          className="rounded-md border border-border bg-surface px-3 py-[6px] text-[12px] text-foreground">
          取消
        </button>
      </div>
    </div>
  );
}
