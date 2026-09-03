"use client";

import { useState } from "react";

import type { LineupCandidate } from "@/lib/api";
import { candidateAssignment } from "./savedLoad";

/** The save server action, bound to (season,division,team) by the page; the
 *  client supplies name + assignment. A server action, so it may cross the
 *  server→client boundary as a prop. */
export type SaveLineupAction = (
  name: string,
  assignment: Record<string, [string, string]>,
) => Promise<void>;

interface SaveLineupButtonProps {
  candidate: LineupCandidate;
  /** Admin: shows the entry. UI only — the real gate is the method-keyed
   *  middleware on the save route. */
  canEdit: boolean;
  /** Bound to (season,division,team) by the page. Absent in isolation
   *  (tests render the button without wiring); the control still renders. */
  saveAction?: SaveLineupAction;
}

/**
 * "保存此阵容" on a candidate row: stores this exact ten-player line assignment
 * plus each player's current participation UTR (the snapshot is built
 * server-side). Names must be non-empty; a same-name save overwrites.
 */
export function SaveLineupButton({
  candidate,
  canEdit,
  saveAction,
}: SaveLineupButtonProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || !saveAction) return;
    setBusy(true);
    setError(null);
    try {
      await saveAction(trimmed, candidateAssignment(candidate));
      setNaming(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  if (!naming) {
    return (
      <button
        type="button"
        onClick={() => setNaming(true)}
        className="flex-none rounded-token bg-primary px-2.5 py-1 text-[12px] text-primary-foreground"
      >
        保存此阵容
      </button>
    );
  }

  return (
    <span className="flex flex-none items-center gap-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="给这套阵容起名"
        maxLength={60}
        className="h-8 w-40 rounded-token border border-border bg-surface px-2 text-[12px] text-foreground"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || name.trim() === ""}
        className="rounded-token bg-primary px-2.5 py-1 text-[12px] text-primary-foreground disabled:opacity-50"
      >
        保存
      </button>
      <button
        type="button"
        onClick={() => {
          setNaming(false);
          setError(null);
        }}
        className="rounded-token border border-border bg-surface-muted px-2 py-1 text-[12px] text-foreground"
      >
        取消
      </button>
      {error ? (
        <span className="text-[11px] text-danger">{error}</span>
      ) : null}
    </span>
  );
}
