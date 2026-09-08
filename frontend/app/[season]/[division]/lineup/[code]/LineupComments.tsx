"use client";

import { useState, useTransition } from "react";

import type { LineupComment } from "@/lib/api";
import { formatWhen } from "@/components/notes/notesDisplay";

interface LineupCommentsProps {
  /** Comments for this saved lineup, newest first (as the backend returns). */
  comments: LineupComment[];
  /** Edit mode (canEdit && editing): shows the append form + delete controls.
   *  View mode (false): a read-only timeline, no form, no delete. */
  editable: boolean;
  /** Append a comment. Present only when editable. */
  onAdd?: (body: string) => Promise<void>;
  /** Delete a comment by id. Present only when editable. */
  onDelete?: (commentId: number) => Promise<void>;
}

/**
 * A card-internal expandable comment area for a saved lineup — symmetric to a
 * player's notes. Folded it shows a count; expanded it shows the newest-first
 * timeline and, in edit mode, an append form and per-comment delete (with an
 * inline confirm).
 *
 * Deliberately NOT a body-portal popover: an input that lives inside a
 * hover/portal overlay gets closed on touch by emulated mouse events (see
 * CLAUDE.md). This is plain in-card flow — nothing to clip, nothing to close.
 */
export function LineupComments({ comments, editable, onAdd, onDelete }: LineupCommentsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const body = draft.trim();
    if (!body || !onAdd) return;
    setError(null);
    start(async () => {
      try {
        await onAdd(body);
        setDraft("");
      } catch {
        setError("评论保存失败——请重试或刷新。");
      }
    });
  }

  function remove(id: number) {
    if (!onDelete) return;
    setError(null);
    start(async () => {
      try {
        await onDelete(id);
        setConfirmId(null);
      } catch {
        setError("删除失败——请重试或刷新。");
      }
    });
  }

  return (
    <div className="min-w-0 border-t border-border pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12.5px] text-foreground"
      >
        <span className="text-[11px] text-muted-foreground">{open ? "▾" : "▸"}</span>
        评论 <span className="font-mono text-[11px] text-muted-foreground">{comments.length}</span>
      </button>

      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          {editable && onAdd ? (
            <div className="flex flex-col gap-1.5 rounded-token border border-border bg-surface-muted p-2">
              <textarea
                aria-label="写评论"
                placeholder="写一条评论…（如：打 THU 用这套，D2 偏弱盯紧）"
                value={draft}
                maxLength={2000}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-10 resize-y rounded-token border border-border bg-surface px-2 py-1.5 text-[12.5px] text-foreground"
              />
              <button
                type="button"
                disabled={!draft.trim() || pending}
                onClick={submit}
                className="min-h-11 self-start rounded-token bg-primary px-3 py-1.5 text-[12px] text-primary-foreground disabled:opacity-40"
              >
                追加
              </button>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          {comments.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">还没有评论。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-r-token border-l-2 border-border bg-surface-muted px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {formatWhen(c.created_at)}
                    </span>
                    {editable && onDelete ? (
                      confirmId === c.id ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          删除这条？
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(c.id)}
                            className="rounded-token border border-danger-border bg-danger-surface px-1.5 py-0.5 text-danger disabled:opacity-40"
                          >
                            确认
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-token border border-border bg-surface px-1.5 py-0.5 text-foreground"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(c.id)}
                          className="text-[11px] text-danger"
                        >
                          删除
                        </button>
                      )
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-foreground">
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
