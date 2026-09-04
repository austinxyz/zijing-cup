"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  logout,
  unlockAdmin,
  type UnlockState,
} from "@/app/login/actions";

interface EditModeToggleProps {
  /** Whether the viewer already holds an admin session. */
  signedIn: boolean;
  /** Test-only: render a failure state without driving the server action. */
  error?: UnlockState["error"];
  remaining?: number;
}

function Message({
  error,
  remaining,
}: {
  error?: UnlockState["error"];
  remaining?: number;
}) {
  if (!error) return null;
  const text =
    error === "rate-limited"
      ? "试得太多了。需要等 15 分钟再来。"
      : `口令不对。还可以试 ${remaining ?? 0} 次，之后需要等 15 分钟。`;
  return (
    <span
      role="alert"
      className="text-[11.5px] leading-snug text-danger"
    >
      {text}
    </span>
  );
}

/**
 * The in-place admin unlock: a switch that, when the viewer is not signed in,
 * opens a password field right here on the lineup page rather than sending them
 * to `/login`. On success it refreshes the current route so the server re-reads
 * the session and the edit controls appear — no navigation. Already-signed-in
 * viewers see an unlocked marker and a logout control.
 *
 * The password is checked by `unlockAdmin`, which shares `login`'s auth core
 * (same rate limit, same failure feedback); the write routes stay guarded by
 * the method-keyed middleware, so this is an entry point, not a new trust face.
 */
export function EditModeToggle({
  signedIn,
  error,
  remaining,
}: EditModeToggleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UnlockState | undefined, FormData>(
    unlockAdmin,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state?.ok, router]);

  if (signedIn) {
    return (
      <form action={logout} className="flex items-center gap-2">
        <span className="text-[12px] font-medium text-success">✓ 已解锁编辑</span>
        <button
          type="submit"
          className="min-h-11 rounded-token border border-border bg-surface-muted px-2.5 py-1.5 text-[12px] text-foreground"
        >
          登出
        </button>
      </form>
    );
  }

  const shownError = error ?? state?.error;
  const shownRemaining = error ? remaining : state?.remaining;

  // A failed attempt keeps the field open so the reader sees why and can retry.
  if (!open && !shownError) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 flex-none rounded-token border border-border bg-surface-muted px-2.5 py-1.5 text-[12px] text-foreground"
      >
        编辑模式
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        name="password"
        aria-label="管理员口令"
        autoComplete="current-password"
        placeholder="管理员口令"
        className="h-11 w-40 rounded-token border border-border bg-surface px-2.5 font-mono text-[12.5px] text-foreground"
      />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-token bg-primary px-3 py-1.5 text-[12px] text-primary-foreground disabled:opacity-50"
      >
        {pending ? "解锁中…" : "解锁"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-11 rounded-token border border-border bg-surface-muted px-2 py-1.5 text-[12px] text-foreground"
      >
        取消
      </button>
      <Message error={shownError} remaining={shownRemaining} />
    </form>
  );
}
