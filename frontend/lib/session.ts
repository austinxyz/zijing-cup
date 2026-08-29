// server-only module: never import this from a "use client" component.
//
// The admin session lives here, on the Next side. The browser never talks to
// FastAPI directly, so this is where "who is this" is established; the backend
// only learns "the server vouches for an admin" via X-Admin-Secret, which
// never leaves the server.
//
// No JWT. There is one admin and one server consuming the token, so a
// self-describing, third-party-verifiable format buys nothing and costs key
// rotation and expiry semantics. A signed payload is enough.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "zj_admin";

/** Two hours, matching what the login page tells the user. */
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Failed logins allowed inside one window before the lockout. */
export const LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * scrypt with a random salt, stored as `salt:hash`.
 *
 * Exported because the only honest way to configure ADMIN_PASSWORD_HASH is to
 * generate it with the same function that checks it — a hash produced by some
 * other tool with other parameters would fail to verify and look like a wrong
 * password.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Fail closed: an unconfigured hash means nobody gets in.
 *
 * The alternative — treating "no hash set" as "no password required" — is the
 * deployment mistake this whole surface has to be closed about, and it is the
 * same rule the backend applies to a missing ADMIN_SECRET.
 */
export async function checkPassword(password: string): Promise<boolean> {
  const configured = process.env.ADMIN_PASSWORD_HASH;
  if (!configured || !password) return false;

  const [salt, expected] = configured.split(":");
  if (!salt || !expected) return false;

  const derived = scryptSync(password, salt, 32);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (derived.length !== expectedBuffer.length) return false;

  return timingSafeEqual(derived, expectedBuffer);
}

export interface Session {
  issuedAt: number;
  expiresAt: number;
}

export async function issueSession(): Promise<string> {
  const payload = JSON.stringify({
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** The session a token stands for, or null if it is forged, stale or junk. */
export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let expected: string;
  try {
    expected = sign(encoded);
  } catch {
    // No signing secret configured: nothing can be trusted, so nothing is.
    return null;
  }

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const session = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as Session;
    if (typeof session.expiresAt !== "number") return null;
    if (session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

interface Attempts {
  count: number;
  firstAt: number;
}

// In memory, keyed by address. Render's free instance is a single process, so
// this is real; on more than one instance it would only slow an attacker down
// per-process. Written here rather than reached for Redis because the cost of
// that dependency is larger than what it buys for one admin account — and
// stated so the assumption is visible when the deployment changes.
const attempts = new Map<string, Attempts>();

export function resetRateLimit(): void {
  attempts.clear();
}

export function recordFailure(address: string): void {
  const now = Date.now();
  const existing = attempts.get(address);
  if (!existing || now - existing.firstAt > LOGIN_WINDOW_MS) {
    attempts.set(address, { count: 1, firstAt: now });
    return;
  }
  existing.count += 1;
}

export interface RateLimit {
  remaining: number;
  lockedUntil: number | null;
}

/**
 * How many tries are left, and until when if none are.
 *
 * The numbers are returned rather than merely enforced because a limit the
 * server keeps to itself reads as "my password stopped working": the user
 * retries until they are locked out, having been told nothing.
 */
export function rateLimitState(address: string): RateLimit {
  const record = attempts.get(address);
  const now = Date.now();

  if (!record || now - record.firstAt > LOGIN_WINDOW_MS) {
    return { remaining: LOGIN_ATTEMPTS, lockedUntil: null };
  }

  const remaining = Math.max(0, LOGIN_ATTEMPTS - record.count);
  return {
    remaining,
    lockedUntil: remaining === 0 ? record.firstAt + LOGIN_WINDOW_MS : null,
  };
}
