"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { PlayerNote, PlayerNoteCategory } from "@/lib/api";

import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  TAG_CLASS,
  formatWhen,
} from "./notesDisplay";

/** The optional edit capability. Callers on an editable surface (roster edit
 *  mode) pass bound callbacks; every other surface omits it and the popover is
 *  read-only. The callbacks wrap the existing addPlayerNote/deletePlayerNote
 *  server actions (bound to season/division/playerId by the caller). */
export interface NotesEdit {
  onAdd: (category: PlayerNoteCategory, body: string) => Promise<void>;
  onDelete: (noteId: number) => Promise<void>;
}

function AppendForm({ onAdd }: { onAdd: NotesEdit["onAdd"] }) {
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
        await onAdd(category, trimmed);
        setBody(""); // success only; revalidatePath refreshes the timeline
      } catch (e) {
        setError(e instanceof Error ? e.message : "追加失败");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface-muted px-3 py-2.5">
      <select
        aria-label="评价类别"
        value={category}
        onChange={(e) => setCategory(e.target.value as PlayerNoteCategory)}
        className="min-h-8 rounded-token border border-border bg-surface px-2 text-[12.5px] text-foreground"
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
        className="rounded-token border border-border bg-surface px-2 py-1.5 text-[12.5px] leading-relaxed text-foreground"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!trimmed || pending}
          className="inline-flex min-h-8 items-center self-start rounded-token bg-primary px-3 text-[12px] text-primary-foreground disabled:opacity-50"
        >
          追加
        </button>
        {error ? <span className="text-[11.5px] text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

function DeleteControl({
  noteId,
  onDelete,
}: {
  noteId: number;
  onDelete: NotesEdit["onDelete"];
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await onDelete(noteId); // success refreshes via revalidatePath
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-[11.5px]">
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
  );
}

/**
 * A popover showing a player's notes as a timeline. The trigger is a real
 * `<button>` (keyboard/触屏 reachable); the panel opens on hover or click.
 *
 * The panel is rendered through a portal to `document.body` with fixed
 * positioning, NOT absolutely inside the trigger. Its hosts — a roster table
 * cell, a LineBlock seat — set `overflow-hidden`, which would clip an
 * absolutely-positioned panel to a 40px-tall row (found in the visual diff).
 * A body portal escapes every overflow ancestor.
 *
 * Read-only by default; pass `edit` (roster edit mode only) to add an append
 * form + per-note delete. `notes` render in the order given (newest first).
 * Hover opens; click toggles; clicking away or Escape closes.
 */
export function NotesPopover({
  notes,
  label,
  children,
  edit,
}: {
  notes: PlayerNote[];
  /** Popover header, e.g. "张三 · 评价". */
  label: string;
  /** The trigger content — the seat「评」marker, the badges, or a「＋记评价」entry. */
  children: ReactNode;
  /** Present only on an editable surface (roster edit mode) → append + delete. */
  edit?: NotesEdit;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Sticky = opened by click; stays until an explicit close (outside/Esc). A
  // hover-opened popover instead closes when the pointer leaves both the trigger
  // and the panel — without this, hovering one player then another leaves the
  // first popover open and they pile up.
  const stickyRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function close() {
    cancelClose();
    stickyRef.current = false;
    setOpen(false);
  }
  function scheduleClose() {
    if (stickyRef.current) return; // click-opened: only outside/Esc closes it
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  function openByHover() {
    cancelClose();
    setOpen(true);
  }
  function toggleByClick() {
    cancelClose();
    setOpen((v) => {
      const next = !v;
      stickyRef.current = next;
      return next;
    });
  }

  useEffect(() => () => cancelClose(), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = 272;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        close();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      className="inline-flex"
      // Hover open/close only when read-only. An editable popover is click-only
      // and sticky: on a touch device a tap fires an emulated mouseenter, and a
      // non-sticky hover-open would then be dismissed by any stray mouseleave
      // (keyboard appearing, focus shift) — closing the form mid-typing.
      onMouseEnter={edit ? undefined : openByHover}
      onMouseLeave={edit ? undefined : scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleByClick}
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
              onMouseEnter={edit ? undefined : cancelClose}
              onMouseLeave={edit ? undefined : scheduleClose}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 272 }}
              className="z-50 overflow-hidden rounded-token border border-border bg-surface text-left shadow-lg"
            >
              <div className="border-b border-border px-3 py-1.5 text-[11.5px] text-muted">
                {label}
              </div>

              {edit ? <AppendForm onAdd={edit.onAdd} /> : null}

              {notes.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-muted">
                  还没有评价，追加第一条。
                </div>
              ) : (
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
                      {edit ? (
                        <DeleteControl noteId={note.id} onDelete={edit.onDelete} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
