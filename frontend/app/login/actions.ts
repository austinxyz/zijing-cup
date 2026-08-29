"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  checkPassword,
  issueSession,
  rateLimitState,
  recordFailure,
} from "@/lib/session";

export interface LoginState {
  error?: "bad-password" | "rate-limited";
  remaining?: number;
  lockedUntil?: number | null;
}

async function callerAddress(): Promise<string> {
  const store = await headers();
  // Behind Vercel every request carries this; the fallback keeps one shared
  // bucket rather than handing an unlabelled caller an unlimited one.
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Exchange a password for a session cookie.
 *
 * The password never reaches FastAPI: the backend only learns that this server
 * vouches for an admin, via a secret that stays server-side. So this is the one
 * place where "who is this" is decided.
 */
export async function login(
  _previous: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const address = await callerAddress();
  const limit = rateLimitState(address);

  if (limit.remaining === 0) {
    // The right password waits too. Letting it through would mean the limit
    // only ever slows down someone who is already guessing wrong.
    return { error: "rate-limited", remaining: 0, lockedUntil: limit.lockedUntil };
  }

  const password = String(formData.get("password") ?? "");
  if (!(await checkPassword(password))) {
    recordFailure(address);
    const after = rateLimitState(address);
    return {
      error: after.remaining === 0 ? "rate-limited" : "bad-password",
      remaining: after.remaining,
      lockedUntil: after.lockedUntil,
    };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await issueSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}
