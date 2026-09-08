"use client";

import type { PlayerNote, PlayerNoteCategory } from "@/lib/api";

import { NotesPopover, type NotesEdit } from "./NotesPopover";
import { CATEGORY_LABEL, CATEGORY_ORDER, TAG_CLASS } from "./notesDisplay";

/**
 * The wide-space notes display for roster / opponent-compare rows: one coloured
 * pill per category present (with a count), opening the shared timeline popover.
 *
 * Read-only by default. On an editable surface (roster edit mode) the caller
 * passes `edit`, which is threaded into the popover (append + delete) AND makes a
 * player with NO notes render a「＋记评价」entry — otherwise there is no pill to
 * click and the first note could never be added. Without `edit`, a note-less
 * player renders nothing (no placeholder).
 */
export function PlayerNotesBadges({
  notes,
  label,
  edit,
}: {
  notes: PlayerNote[];
  /** Popover header, e.g. "张三 · 评价". */
  label: string;
  /** Present only on an editable surface (roster edit mode). */
  edit?: NotesEdit;
}) {
  if (notes.length === 0) {
    // Read-only + empty → nothing. Editable + empty → an add entry so the first
    // note has a way in.
    if (!edit) return null;
    return (
      <NotesPopover notes={notes} label={label} edit={edit}>
        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-surface px-2 py-px text-[11px] text-muted">
          ＋记评价
        </span>
      </NotesPopover>
    );
  }

  const counts = notes.reduce(
    (acc, note) => {
      acc[note.category] = (acc[note.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<PlayerNoteCategory, number>,
  );

  return (
    <NotesPopover notes={notes} label={label} edit={edit}>
      <span className="inline-flex flex-wrap items-center gap-1">
        {CATEGORY_ORDER.filter((cat) => counts[cat]).map((cat) => (
          <span key={cat} className={TAG_CLASS[cat]}>
            {CATEGORY_LABEL[cat]}
            <span className="ml-1 font-mono tabular-nums opacity-80">
              {counts[cat]}
            </span>
          </span>
        ))}
      </span>
    </NotesPopover>
  );
}
