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

/** Failed logins allowed from one address inside one window. */
export const LOGIN_ATTEMPTS = 5;

/**
 * Failed logins allowed in total, whatever address they claim to come from.
 *
 * The per-address bucket is only as trustworthy as the address, and on a public
 * endpoint the address arrives in a header. Without a ceiling that ignores the
 * address entirely, an attacker rotates the header and the lockout never fires.
 * Set well above the per-address allowance so a human mistyping their password
 * never meets it.
 */
export const LOGIN_ATTEMPTS_GLOBAL = 20;

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
/**
 * Whether `password` derives to `hash` (a `salt:hash` from hashPassword).
 *
 * The single scrypt + timing-safe compare, shared by the super check
 * (`checkPassword`) and the per-competition check (`checkCompetitionPassword`)
 * so the two cannot drift into different comparison behaviour.
 */
export function matches(hash: string | null | undefined, password: string): boolean {
  if (!hash || !password) return false;
  const [salt, expected] = hash.split(":");
  if (!salt || !expected) return false;

  const derived = scryptSync(password, salt, 32);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (derived.length !== expectedBuffer.length) return false;

  return timingSafeEqual(derived, expectedBuffer);
}

/**
 * The super password: the existing single `ADMIN_PASSWORD_HASH`. Reused as the
 * owner's all-competitions credential, so their current password keeps working.
 *
 * Fail closed: an unconfigured hash means nobody gets in — the same rule the
 * backend applies to a missing ADMIN_SECRET.
 */
export async function checkPassword(password: string): Promise<boolean> {
  return matches(process.env.ADMIN_PASSWORD_HASH, password);
}

/**
 * Whether `password` matches the stored password for one competition.
 *
 * Reads the hash from the backend (guarded by X-Backend-Secret, which only this
 * server holds — so this can run during login, before any user is
 * authenticated). Any failure — no credential row (404), a network error, a
 * missing config — is treated as "no password set" (false), i.e. that
 * competition is unlockable only by super. Never throws to the caller and never
 * lets a read failure read as a pass.
 */
export async function checkCompetitionPassword(
  season: string | number,
  division: string,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const base = process.env.BACKEND_URL;
  const backendSecret = process.env.BACKEND_SECRET;
  if (!base || !backendSecret) return false;

  try {
    const res = await fetch(
      `${base}/api/seasons/${season}/divisions/${encodeURIComponent(division)}/admin-credential`,
      {
        cache: "no-store",
        headers: { "X-Backend-Secret": backendSecret },
      },
    );
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as
      | { password_hash?: string }
      | null;
    return matches(body?.password_hash, password);
  } catch {
    return false;
  }
}

/**
 * The scope a password earns for a competition context, or null if none.
 *
 * Super first (the existing `ADMIN_PASSWORD_HASH`) → `"*"`; else, when a
 * competition is in context, that competition's stored password → its scope;
 * else null. With no competition context (the global /login), only super is
 * accepted — there is no competition to scope to.
 */
export async function resolveScope(
  season: string | number | null,
  division: string | null,
  password: string,
): Promise<string | null> {
  if (await checkPassword(password)) return "*";
  if (
    season != null &&
    division != null &&
    (await checkCompetitionPassword(season, division, password))
  ) {
    return `${season}:${division}`;
  }
  return null;
}

export interface Session {
  issuedAt: number;
  expiresAt: number;
  /** What this session may edit: "*" (super, everything) or "<season>:<division>"
   *  (that one competition only). Part of the SIGNED payload, so it cannot be
   *  escalated by editing the cookie — a changed scope invalidates the
   *  signature. */
  scope: string;
}

export async function issueSession(scope: string): Promise<string> {
  const payload = JSON.stringify({
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    scope,
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
    // A session with no scope predates scoping / is malformed — reject rather
    // than treat as super. Fail closed.
    if (typeof session.scope !== "string" || session.scope === "") return null;
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

//: Everything, regardless of claimed address. See LOGIN_ATTEMPTS_GLOBAL.
const GLOBAL_KEY = "all-addresses (not a valid header value)";

export function resetRateLimit(): void {
  attempts.clear();
}

function bump(key: string): void {
  const now = Date.now();
  const existing = attempts.get(key);
  if (!existing || now - existing.firstAt > LOGIN_WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  existing.count += 1;
}

export function recordFailure(address: string): void {
  bump(address);
  bump(GLOBAL_KEY);
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
  const now = Date.now();

  const measure = (key: string, allowance: number): RateLimit => {
    const record = attempts.get(key);
    if (!record || now - record.firstAt > LOGIN_WINDOW_MS) {
      return { remaining: allowance, lockedUntil: null };
    }
    const remaining = Math.max(0, allowance - record.count);
    return {
      remaining,
      lockedUntil: remaining === 0 ? record.firstAt + LOGIN_WINDOW_MS : null,
    };
  };

  const perAddress = measure(address, LOGIN_ATTEMPTS);
  const global = measure(GLOBAL_KEY, LOGIN_ATTEMPTS_GLOBAL);

  // Whichever bucket is closer to empty decides. The global one is what makes
  // rotating the claimed address pointless; the per-address one is what stops
  // a single typing mistake from spending everyone's allowance.
  return perAddress.remaining <= global.remaining ? perAddress : global;
}
