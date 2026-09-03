"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { LineupPlayer, LineupViolation, SavedLineup } from "@/lib/api";
import { replaceSlot, swapSlots, type Slot } from "./editor";
import { GENDER_LABEL, money } from "./candidate";

type Assignment = Record<string, [string, string]>;

/** The live re-judgement of the edited assignment. `idle` before the first
 *  edit, `checking` while a debounced validate is in flight, then the verdict.
 *  Legality is always the backend's answer — never re-derived here. */
type LiveState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "bad"; violations: LineupViolation[] };

const DEBOUNCE_MS = 300;

interface LineupEditorProps {
  saved: SavedLineup;
  roster: LineupPlayer[];
  lineOrder: string[];
  /** Judge an assignment against current UTRs; empty means legal. */
  validateAction: (assignment: Assignment) => Promise<LineupViolation[]>;
  /** Overwrite the saved lineup with the edited assignment (re-snapshots). */
  saveBackAction: (assignment: Assignment) => Promise<void>;
  /** Called after a successful save-back, so the page can leave edit mode. */
  onDone?: () => void;
}

function toTuples(assignment: SavedLineup["assignment"]): Assignment {
  const out: Assignment = {};
  for (const [line, pair] of Object.entries(assignment)) {
    out[line] = [pair[0], pair[1]];
  }
  return out;
}

function sameSlot(a: Slot, b: Slot): boolean {
  return a.line === b.line && a.index === b.index;
}

/**
 * In-place editor for one saved lineup: replace a seat from the whole roster,
 * or select two seats and swap them. Every edit is re-judged by the backend
 * after a short debounce and the verdict shown next to the controls. Editing is
 * free; legality is the only guard, and it is reported, never enforced — a
 * duplicate player surfaces as a violation, it is not pre-blocked. Save-back is
 * offered only once the edit is legal.
 */
export function LineupEditor({
  saved,
  roster,
  lineOrder,
  validateAction,
  saveBackAction,
  onDone,
}: LineupEditorProps) {
  const [assignment, setAssignment] = useState<Assignment>(() =>
    toTuples(saved.assignment),
  );
  //: Up to two seats picked for a swap. Two picked → the 互换 button commits.
  const [selected, setSelected] = useState<Slot[]>([]);
  const [live, setLive] = useState<LiveState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const firstRun = useRef(true);

  const byKey = useMemo(
    () => new Map(roster.map((p) => [p.key, p])),
    [roster],
  );
  function optionLabel(key: string): string {
    const p = byKey.get(key);
    if (!p) return key;
    const gender = p.gender ? GENDER_LABEL[p.gender] ?? p.gender : "";
    return `${p.last_name}${p.first_name} · ${money(p.match_utr)}${gender}`;
  }

  const lines = lineOrder.filter((line) => assignment[line]);

  // Re-judge after every edit, debounced. Skipped on mount: the saved lineup
  // already carries a backend verdict, and validating an unchanged lineup would
  // spend an admin round-trip to learn what the page already showed.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setLive({ kind: "checking" });
    let cancelled = false;
    const timer = setTimeout(async () => {
      const violations = await validateAction(assignment);
      if (cancelled) return;
      setLive(
        violations.length > 0
          ? { kind: "bad", violations }
          : { kind: "ok" },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assignment, validateAction]);

  function isPicked(slot: Slot): boolean {
    return selected.some((s) => sameSlot(s, slot));
  }

  function pick(slot: Slot) {
    setSelected((current) => {
      if (current.some((s) => sameSlot(s, slot))) {
        return current.filter((s) => !sameSlot(s, slot));
      }
      // Hold at most two: a third pick replaces the oldest.
      return [...current, slot].slice(-2);
    });
  }

  function swap() {
    if (selected.length !== 2) return;
    const [a, b] = selected;
    setAssignment((current) => swapSlots(current, a, b));
    setSelected([]);
  }

  function replace(slot: Slot, key: string) {
    setSelected([]);
    setAssignment((current) => replaceSlot(current, slot, key));
  }

  async function saveBack() {
    setSaving(true);
    try {
      await saveBackAction(assignment);
      onDone?.();
    } finally {
      setSaving(false);
    }
  }

  const legal = live.kind === "ok";

  return (
    <div className="flex flex-col gap-3 rounded-token border border-dashed border-primary/50 bg-surface px-4 py-3.5">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        把顶超的强手拆开：选两个槽点「互换」对调，或把某个槽换成名单里另一个人。每改一次实时重判。
      </p>

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <div key={line} className="flex items-center gap-2">
            <span className="w-9 flex-none font-mono text-[11px] text-muted-foreground">
              {line}
            </span>
            {([0, 1] as const).map((index) => {
              const slot: Slot = { line, index };
              const key = assignment[line][index];
              const picked = isPicked(slot);
              return (
                <div key={index} className="flex min-w-0 flex-1 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`选中 ${line} 第${index + 1}人`}
                    aria-pressed={picked}
                    onClick={() => pick(slot)}
                    className={`h-11 w-11 flex-none rounded-token border text-[11px] ${
                      picked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-muted text-muted-foreground"
                    }`}
                  >
                    选
                  </button>
                  <select
                    aria-label={`${line} 第${index + 1}人`}
                    value={key}
                    onChange={(e) => replace(slot, e.target.value)}
                    className="h-11 min-w-0 flex-1 rounded-token border border-border bg-surface px-2 text-[12px] text-foreground"
                  >
                    {roster.map((p) => (
                      <option key={p.key} value={p.key}>
                        {optionLabel(p.key)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-muted-foreground">
            已选中{" "}
            {selected.map((s) => `${s.line} 第${s.index + 1}人`).join(" 与 ")}
            {selected.length === 1 ? "，再选一个槽即可互换。" : "。"}
          </span>
          <button
            type="button"
            onClick={swap}
            disabled={selected.length !== 2}
            className="min-h-11 rounded-token bg-primary px-3 py-2 text-[12px] text-primary-foreground disabled:opacity-50"
          >
            互换选中的两人
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="min-h-11 rounded-token border border-border bg-surface-muted px-2.5 py-2 text-[12px] text-foreground"
          >
            取消选择
          </button>
        </div>
      ) : null}

      {live.kind === "checking" ? (
        <p className="rounded-token bg-surface-muted px-2.5 py-2 text-[12px] text-muted-foreground">
          校验中…
        </p>
      ) : null}
      {live.kind === "ok" ? (
        <p className="rounded-token border border-success-border bg-success-surface px-2.5 py-2 text-[12.5px] text-success">
          实时：这套现在合法。可以存回。
        </p>
      ) : null}
      {live.kind === "bad" ? (
        <ul className="flex flex-col gap-1">
          {live.violations.map((v, i) => (
            <li
              key={i}
              className="rounded-r-token border-l-2 border-danger-border bg-danger-surface px-2.5 py-2 text-[12.5px] text-foreground"
            >
              <span className="font-semibold text-danger">
                {v.line ? `${v.line} ` : ""}
              </span>
              {v.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void saveBack()}
          disabled={!legal || saving}
          className="min-h-11 rounded-token bg-primary px-3 py-2 text-[12px] text-primary-foreground disabled:opacity-50"
        >
          存回
        </button>
      </div>
    </div>
  );
}
