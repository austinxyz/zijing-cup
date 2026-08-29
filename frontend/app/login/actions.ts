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

  // Prefer the header the platform sets itself. `x-forwarded-for` is a list the
  // CALLER can prepend to, so its first entry is whatever they typed — keying
  // the rate limit on that lets an attacker rotate it and never meet the
  // lockout. The last entry is the one the nearest trusted proxy appended.
  //
  // This only narrows the per-address bucket; the global ceiling in
  // lib/session.ts is what actually makes rotation pointless, because no header
  // can influence it at all.
  const trusted = store.get("x-real-ip") ?? store.get("x-vercel-forwarded-for");
  if (trusted) return trusted.trim();

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
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
