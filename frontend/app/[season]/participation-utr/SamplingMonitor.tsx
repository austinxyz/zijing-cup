"use client";

import { useMemo, useState, useTransition } from "react";

import type { SeasonSamplingRow } from "@/lib/api";

type Filter = "all" | "gold" | "silver" | "needs_review";

interface SamplingMonitorProps {
  season: string;
  /** Sorted union of every sampled date (the table's day columns). */
  dates: string[];
  rows: SeasonSamplingRow[];
  /** Snapshot every season player's current doubles UTR under today's date. */
  snapshotAction: () => Promise<void>;
  /** Set a player's rated average as the participation UTR. */
  setAction: (playerId: number) => Promise<void>;
}

const DIV_LABEL: Record<string, string> = { gold: "金", silver: "银" };

function shortDate(iso: string): string {
  // YYYY-MM-DD → MM/DD
  const [, m, d] = iso.split("-");
  return m && d ? `${m}/${d}` : iso;
}

function displayName(r: SeasonSamplingRow): string {
  return `${r.last_name} ${r.first_name}`;
}

export function SamplingMonitor({
  season,
  dates,
  rows,
  snapshotAction,
  setAction,
}: SamplingMonitorProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "needs_review") return rows.filter((r) => r.flag === "needs_review");
    // Nullish-guarded: during a deploy skew the backend may still omit the
    // field (old shape had a single `division`), and a bare `.includes` would
    // crash the page rather than just show nothing.
    return rows.filter((r) => (r.divisions ?? []).includes(filter));
  }, [rows, filter]);

  function run(fn: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败，请重试。");
      }
    });
  }

  const tabs: [Filter, string][] = [
    ["all", "全部"],
    ["gold", "金组"],
    ["silver", "银组"],
    ["needs_review", "待核"],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-token border border-border bg-surface px-3 py-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(snapshotAction)}
          className="min-h-11 rounded-token bg-primary px-3.5 py-1.5 text-[12.5px] text-primary-foreground disabled:opacity-50"
        >
          快照今天
        </button>
        <span className="flex-1" />
        <div className="inline-flex overflow-hidden rounded-token border border-border">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1 text-[12px] ${
                filter === key
                  ? "bg-surface-muted font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">这一档还没有队员采样。</p>
      ) : (
        <div className="overflow-x-auto rounded-token border border-border bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface-muted text-[11px] text-muted">
                <th className="px-2.5 py-2 text-left font-semibold">队员</th>
                <th className="px-2.5 py-2 text-left font-semibold">组</th>
                {dates.map((d) => (
                  <th key={d} className="px-2.5 py-2 text-right font-mono font-semibold">
                    {shortDate(d)}
                  </th>
                ))}
                <th className="px-2.5 py-2 text-right font-semibold">rated 均值</th>
                <th className="px-2.5 py-2 text-left font-semibold">状态</th>
                <th className="px-2.5 py-2 text-left font-semibold">参赛 UTR</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const byDate = new Map(r.samples.map((s) => [s.sample_date, s]));
                return (
                  <tr
                    key={r.player_id}
                    aria-label={displayName(r)}
                    className="border-t border-border"
                  >
                    <td className="px-2.5 py-2 font-medium text-foreground">
                      {displayName(r)}
                    </td>
                    <td className="px-2.5 py-2 text-[11px] text-muted-foreground">
                      {(r.divisions ?? []).length
                        ? (r.divisions ?? []).map((d) => DIV_LABEL[d] ?? d).join("/")
                        : "—"}
                    </td>
                    {dates.map((d) => {
                      const s = byDate.get(d);
                      const nonRated = s && s.doubles_status !== "rated";
                      return (
                        <td
                          key={d}
                          className={`px-2.5 py-2 text-right font-mono ${
                            !s
                              ? "text-muted-foreground"
                              : nonRated
                                ? "text-warning"
                                : "text-foreground"
                          }`}
                        >
                          {!s
                            ? "—"
                            : s.doubles_utr == null
                              ? "U"
                              : nonRated
                                ? `P${s.doubles_utr}`
                                : s.doubles_utr}
                        </td>
                      );
                    })}
                    <td className="px-2.5 py-2 text-right font-mono font-bold">
                      {r.rated_avg ?? "—"}
                    </td>
                    <td className="px-2.5 py-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10.5px] ${
                          r.flag === "ok"
                            ? "border-success-border bg-success-surface text-success"
                            : "border-warning-border bg-warning-surface text-warning"
                        }`}
                      >
                        {r.flag === "ok" ? "正常" : "待核"}
                      </span>
                    </td>
                    <td className="px-2.5 py-2">
                      {r.can_set ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setAction(r.player_id))}
                          className="rounded-token border border-border bg-surface px-2.5 py-1 text-[11.5px] text-foreground disabled:opacity-50"
                        >
                          定为 {r.rated_avg}
                        </button>
                      ) : (
                        <span className="text-[11px] text-warning">
                          组委会核 match UTR
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
