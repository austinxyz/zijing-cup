"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { PlayerNote } from "@/lib/api";

import { CATEGORY_LABEL, TAG_CLASS, formatWhen } from "./notesDisplay";

/**
 * A read-only popover showing a player's notes as a timeline. The trigger is a
 * real `<button>` (keyboard/触屏 reachable); the panel opens on hover or click.
 *
 * The panel is rendered through a portal to `document.body` with fixed
 * positioning, NOT absolutely inside the trigger. Its hosts — a roster table
 * cell, a LineBlock seat — set `overflow-hidden`, which would clip an
 * absolutely-positioned panel to a 40px-tall row (found in the visual diff).
 * A body portal escapes every overflow ancestor.
 *
 * Read-only on purpose: append/delete live only on the player detail page. This
 * is a decision-surface overlay (lineup / compare / roster), not an editor.
 *
 * `notes` are rendered in the order given — callers pass them newest-first (the
 * batch endpoint already sorts desc). Hover opens; click toggles; clicking away
 * or Escape closes (no mouseleave-close, since the portal panel is not a DOM
 * descendant of the trigger and the mouse cannot bridge to it).
 */
export function NotesPopover({
  notes,
  label,
  children,
}: {
  notes: PlayerNote[];
  /** Popover header, e.g. "张三 · 评价". */
  label: string;
  /** The trigger content — the seat「评」marker or the category badges. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the panel just under the trigger, clamped into the viewport, in
  // fixed coordinates (the panel lives on document.body).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = 256;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !panelRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="inline-flex" onMouseEnter={() => setOpen(true)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0"
      >
        {children}
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={label}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 256 }}
              className="z-50 overflow-hidden rounded-token border border-border bg-surface text-left shadow-lg"
            >
              <div className="border-b border-border px-3 py-1.5 text-[11.5px] text-muted">
                {label}
              </div>
              <ul
                aria-label="评价时间线"
                className="m-0 flex max-h-60 list-none flex-col overflow-auto p-0"
              >
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="flex flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={TAG_CLASS[note.category] ?? TAG_CLASS.other}>
                        {CATEGORY_LABEL[note.category] ?? note.category}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {formatWhen(note.created_at)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground">
                      {note.body}
                    </div>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
