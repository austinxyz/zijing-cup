"use client";

import { useState, useTransition } from "react";

import type { PlayerNote, PlayerNoteCategory } from "@/lib/api";

import { addPlayerNote, deletePlayerNote } from "./actions";
import { EditOnly } from "./PlayerEditContext";

/** key → Chinese label. A record keyed by the literal union so a new backend
 *  category is a tsc error (missing key) rather than a raw string on screen. */
const CATEGORY_LABEL: Record<PlayerNoteCategory, string> = {
  strength: "优点",
  weakness: "弱点",
  partner: "适合搭档",
  other: "其他",
};

const CATEGORY_ORDER: PlayerNoteCategory[] = [
  "strength",
  "weakness",
  "partner",
  "other",
];

const TAG_CLASS: Record<PlayerNoteCategory, string> = {
  strength:
    "inline-flex items-center rounded-full border border-[#cfe1d6] bg-[#eef4f0] px-2 py-px text-[11px] leading-relaxed text-[#3b6e4f]",
  weakness:
    "inline-flex items-center rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] leading-relaxed text-warning",
  partner:
    "inline-flex items-center rounded-full border border-[#c9d6ea] bg-[#eef2f8] px-2 py-px text-[11px] leading-relaxed text-[#3a5a86]",
  other:
    "inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] leading-relaxed text-muted",
};

/** ISO → "YYYY-MM-DD HH:mm" in the viewer's local time. The server stores one
 *  clock; the display just makes it readable. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function NoteRow({
  note,
  season,
  division,
  playerId,
}: {
  note: PlayerNote;
  season: string;
  division: string;
  playerId: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deletePlayerNote(season, division, playerId, note.id);
        // Success refreshes via revalidatePath; no local list mutation needed.
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
        setConfirming(false);
      }
    });
  }

  return (
    <li className="flex flex-col gap-1 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        {/* Fall back to the raw key (never a blank tag) if the backend ever
            grows a category this build predates — a wrong-but-present label is
            better than a silently empty one. */}
        <span className={TAG_CLASS[note.category] ?? TAG_CLASS.other}>
          {CATEGORY_LABEL[note.category] ?? note.category}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatWhen(note.created_at)}
        </span>
      </div>
      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
        {note.body}
      </div>
      <EditOnly>
        <div className="flex items-center gap-2 text-[12px]">
          {confirming ? (
            <span className="flex items-center gap-2 text-muted">
              删除这条？
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="rounded-token border border-danger-border bg-danger-surface px-2 py-px text-danger disabled:opacity-50"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-token border border-border bg-surface px-2 py-px text-foreground"
              >
                取消
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-token border border-border bg-surface px-2 py-px text-danger"
            >
              删除
            </button>
          )}
          {error ? <span className="text-danger">{error}</span> : null}
        </div>
      </EditOnly>
    </li>
  );
}

function AppendForm({
  season,
  division,
  playerId,
}: {
  season: string;
  division: string;
  playerId: number;
}) {
  const [category, setCategory] = useState<PlayerNoteCategory>("strength");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();

  function onSubmit() {
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await addPlayerNote(season, division, playerId, category, trimmed);
        setBody(""); // success only; revalidatePath refreshes the timeline
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3.5 py-3">
      <select
        aria-label="评价类别"
        value={category}
        onChange={(e) => setCategory(e.target.value as PlayerNoteCategory)}
        className="min-h-9 rounded-token border border-border bg-surface px-2 text-[13px] text-foreground"
      >
        {CATEGORY_ORDER.map((key) => (
          <option key={key} value={key}>
            {CATEGORY_LABEL[key]}
          </option>
        ))}
      </select>
      <textarea
        aria-label="评价内容"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="写一条评价…（如：反手稳，网前果断）"
        rows={2}
        maxLength={2000}
        className="rounded-token border border-border bg-surface px-2 py-1.5 text-[13px] leading-relaxed text-foreground"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!trimmed || pending}
          className="inline-flex min-h-9 items-center self-start rounded-token bg-primary px-3 text-[12.5px] text-primary-foreground disabled:opacity-50"
        >
          追加
        </button>
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

/**
 * The confidential 评价 section on a player's detail. Rendered only when the
 * caller passed a notes list (which the page fetches only for an unlocked
 * viewer); an unlocked-but-view-mode viewer sees the timeline read-only, and
 * the append/delete controls are gated by `EditOnly` (canEdit && editing).
 */
export function NotesSection({
  season,
  division,
  playerId,
  notes,
}: {
  season: string;
  division: string;
  playerId: number;
  notes: PlayerNote[];
}) {
  return (
    <section
      aria-label="评价"
      className="flex flex-none flex-col rounded-token border border-border bg-surface"
    >
      <div className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
        评价
      </div>

      <EditOnly>
        <AppendForm season={season} division={division} playerId={playerId} />
      </EditOnly>

      {notes.length === 0 ? (
        <div className="px-3.5 py-5 text-center text-[12.5px] text-muted">
          还没有评价，追加第一条。
        </div>
      ) : (
        <ul aria-label="评价时间线" className="m-0 flex list-none flex-col p-0">
          {notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              season={season}
              division={division}
              playerId={playerId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
