"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { LineupPlayer, LineupViolation, SavedLineup } from "@/lib/api";
import { buildSavedLoadHref, savedStaleRefs } from "./savedLoad";
import { GENDER_LABEL, money, overOf } from "./candidate";
import { LineupEditor } from "./LineupEditor";

type Assignment = Record<string, [string, string]>;

interface SavedLineupsProps {
  saved: SavedLineup[];
  roster: LineupPlayer[];
  /** Admin: shows 编辑/删除. UI only — the write routes are method-gated. */
  canEdit: boolean;
  basePath: string;
  /** Line order (D1…WD) for the editor's rows; from the division rules. */
  lineOrder?: string[];
  deleteAction?: (id: number) => Promise<void>;
  /** Judge an edited assignment against current UTRs. Admin only. */
  validateAction?: (assignment: Assignment) => Promise<LineupViolation[]>;
  /** Overwrite a saved lineup (by id) with an edited assignment. Admin only. */
  saveBackAction?: (id: number, assignment: Assignment) => Promise<void>;
}

/** A status the backend sent that this build does not know. Fail closed: a
 *  distinct badge, and load is suppressed (see canLoad) — never fall through
 *  to "仍合法", which would call an unknown state legal. */
const UNKNOWN_BADGE = {
  label: "未知状态",
  className: "text-warning bg-warning-surface border-warning-border",
};

/** status -> the badge wording and its token colour tier. Legality is the
 *  backend's `status`, never re-derived from the snapshot here. */
const BADGE: Record<string, { label: string; className: string }> = {
  valid: {
    label: "仍合法",
    className: "text-success bg-success-surface border-success-border",
  },
  utr_moved: {
    label: "UTR 动了 · 仍合法",
    className: "text-muted-foreground bg-surface-muted border-border",
  },
  illegal: {
    label: "已非法",
    className: "text-danger bg-danger-surface border-danger-border",
  },
  player_gone: {
    label: "有人离队",
    className: "text-warning bg-warning-surface border-warning-border",
  },
};

export function SavedLineups({
  saved,
  roster,
  canEdit,
  basePath,
  lineOrder,
  deleteAction,
  validateAction,
  saveBackAction,
}: SavedLineupsProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const byKey = new Map(roster.map((p) => [p.key, p]));
  const canUseEditor = canEdit && Boolean(validateAction && saveBackAction);

  function displayName(key: string): string {
    const p = byKey.get(key);
    return p ? `${p.last_name}${p.first_name}` : key;
  }

  /** "名字 6.00男" for a present player, or just the key when gone. Display
   *  only — the numbers are the backend's, shown verbatim. */
  function playerLine(key: string): string {
    const p = byKey.get(key);
    if (!p) return key;
    const gender = p.gender ? GENDER_LABEL[p.gender] ?? p.gender : "";
    return `${p.last_name}${p.first_name} ${money(p.match_utr)}${gender}`;
  }

  if (saved.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        这个队还没有保存的阵容。在排阵结果里点「保存此阵容」存一套。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {saved.map((item) => {
        const known = Object.prototype.hasOwnProperty.call(BADGE, item.status);
        const badge = known ? BADGE[item.status] : UNKNOWN_BADGE;
        const stale = savedStaleRefs(item, roster);
        // Load only a lineup we both recognise and can honour: an unknown
        // status is not asserted legal, so it is not loadable either.
        const canLoad = known && stale.length === 0;
        const movers = Object.values(item.utr_diff);
        return (
          <article
            key={item.id}
            aria-label={item.name}
            className="flex flex-col gap-2.5 rounded-token border border-border bg-surface px-4 py-3.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">
                {item.name}
              </span>
              <span
                className={`flex-none rounded border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {item.status === "utr_moved" && movers.length > 0 ? (
              <p className="rounded-token bg-surface-muted px-2.5 py-1.5 text-[12px] leading-relaxed text-muted-foreground">
                保存后有人参赛 UTR 变了，按当前值重判仍合法：
                {movers.map((m, i) => (
                  <span key={i}>
                    {i > 0 ? "、" : ""}
                    <b className="text-foreground">{m.name}</b>{" "}
                    <span className="font-mono text-danger">
                      {m.snapshot}→{m.current}
                    </span>
                  </span>
                ))}
                。
              </p>
            ) : null}

            {item.status === "illegal" ? (
              <ul className="flex flex-col gap-1">
                {item.violations.map((v, i) => (
                  <li
                    key={i}
                    className="rounded-r-token border-l-2 border-danger-border bg-danger-surface px-2.5 py-1.5 text-[12px] leading-relaxed text-foreground"
                  >
                    <span className="font-semibold text-danger">
                      {v.line ? `${v.line} ` : ""}
                    </span>
                    {v.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {item.status === "player_gone" ? (
              <p className="rounded-r-token border-l-2 border-warning-border bg-warning-surface px-2.5 py-1.5 text-[12px] leading-relaxed text-foreground">
                <span className="font-semibold text-warning">
                  {stale.map((r) => r.line).join("、")} 座位的队员已不在名单
                </span>
                ，无法照它布阵——编辑换个人，或删掉。
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {Object.entries(item.assignment).map(([line, pair]) => {
                const missing = pair.some((k) => item.missing.includes(k));
                const lt = item.line_totals?.[line];
                const over = lt ? overOf(lt.over) : null;
                return (
                  <div
                    key={line}
                    className={`flex min-w-0 flex-col gap-1 rounded-token border px-2 py-1.5 ${
                      missing
                        ? "border-warning-border bg-warning-surface"
                        : over
                          ? "border-danger-border bg-danger-surface"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-mono text-[9.5px] text-muted">
                        {line}
                      </span>
                      {lt ? (
                        <span className="font-mono text-[9.5px] text-muted-foreground">
                          {money(lt.total)}
                          {over ? (
                            <span className="text-danger"> 超 {money(over)}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    {pair.map((k, i) => (
                      <span
                        key={i}
                        className="truncate text-[11px] text-foreground"
                      >
                        {playerLine(k)}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>

            {item.buffer_total !== undefined && item.status !== "player_gone" ? (
              <span className="font-mono text-[10.5px] text-muted-foreground">
                全队 buffer {money(item.buffer_spent ?? "0")} /{" "}
                {money(item.buffer_total)}
              </span>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {canLoad ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push(buildSavedLoadHref(basePath, item))
                  }
                  className="min-h-11 flex-none rounded-token bg-primary px-3 py-2 text-[12px] text-primary-foreground"
                >
                  载入
                </button>
              ) : null}
              {canUseEditor ? (
                <button
                  type="button"
                  onClick={() =>
                    setEditingId((id) => (id === item.id ? null : item.id))
                  }
                  className="min-h-11 flex-none rounded-token border border-border bg-surface-muted px-3 py-2 text-[12px] text-foreground"
                >
                  {editingId === item.id ? "收起编辑" : "编辑"}
                </button>
              ) : null}
              {canEdit && deleteAction ? (
                <button
                  type="button"
                  onClick={() => void deleteAction(item.id)}
                  className="min-h-11 flex-none rounded-token border border-danger-border bg-danger-surface px-3 py-2 text-[12px] text-danger"
                >
                  删除
                </button>
              ) : null}
            </div>

            {canUseEditor && editingId === item.id ? (
              <LineupEditor
                saved={item}
                roster={roster}
                lineOrder={lineOrder ?? Object.keys(item.assignment)}
                validateAction={validateAction!}
                saveBackAction={(assignment) =>
                  saveBackAction!(item.id, assignment)
                }
                onDone={() => setEditingId(null)}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
