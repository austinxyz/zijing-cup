"use client";

import type { PlayerNote, PlayerNoteCategory } from "@/lib/api";

import { NotesPopover } from "./NotesPopover";
import { CATEGORY_LABEL, CATEGORY_ORDER, TAG_CLASS } from "./notesDisplay";

/**
 * The wide-space notes display for roster / opponent-compare rows: one coloured
 * pill per category present (with a count), opening the shared read-only
 * timeline popover. Renders nothing when the player has no notes — no empty
 * placeholder.
 */
export function PlayerNotesBadges({
  notes,
  label,
}: {
  notes: PlayerNote[];
  /** Popover header, e.g. "张三 · 评价". */
  label: string;
}) {
  if (notes.length === 0) return null;

  const counts = notes.reduce(
    (acc, note) => {
      acc[note.category] = (acc[note.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<PlayerNoteCategory, number>,
  );

  return (
    <NotesPopover notes={notes} label={label}>
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
