"use client";

import { useActionState } from "react";

import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { login, type LoginState } from "./actions";

interface LoginFormProps {
  /** Rendered directly in tests; in the app these come from the action. */
  error?: LoginState["error"];
  remaining?: number;
}

function Message({ error, remaining }: LoginFormProps) {
  if (!error) return null;

  const text =
    error === "rate-limited"
      ? "试得太多了。需要等 15 分钟再来。"
      : `口令不对。还可以试 ${remaining ?? 0} 次，之后需要等 15 分钟。`;

  return (
    <div
      role="alert"
      className="rounded-token border border-danger-border bg-danger-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-danger"
    >
      {text}
    </div>
  );
}

/**
 * The one control that stands between a reader and the write surface.
 *
 * The failure state is not an afterthought here: a limit that exists only in
 * the server reads as "my password stopped working", and the user keeps trying
 * until they are locked out having been told nothing.
 */
export function LoginForm({ error, remaining }: LoginFormProps) {
  const [state, action, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  const shownError = error ?? state?.error;
  const shownRemaining = error ? remaining : state?.remaining;

  return (
    <form action={action} className="w-[380px] max-w-full">
      <Card>
        <CardHeader>
          <CardTitle>紫荆杯 · 管理员</CardTitle>
          <CardDescription>
            只有管理员可以修改队员数据。读取页面不需要登录，也不受影响。
          </CardDescription>
        </CardHeader>

        <div className="flex flex-col gap-3.5 px-5 pb-5">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-muted">口令</span>
            <input
              type="password"
              name="password"
              aria-label="口令"
              autoComplete="current-password"
              className="h-8 rounded-token border border-border bg-surface px-2.5 font-mono text-[12.5px] text-foreground"
            />
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? "登录中…" : "登录"}
          </Button>

          <Message error={shownError} remaining={shownRemaining} />
        </div>
      </Card>
    </form>
  );
}
