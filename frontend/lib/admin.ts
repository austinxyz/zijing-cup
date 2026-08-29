// server-only module: never import this from a "use client" component.
//
// Every write goes through here. The session is checked BEFORE the request is
// built, so an expired login fails as "log in again" rather than as a 403 from
// the backend — those are different problems and only one of them is the
// user's to fix.
//
// The two secrets are read here and nowhere near the browser: BACKEND_SECRET
// says "this is our server", ADMIN_SECRET says "acting for an admin". Neither
// may ever appear in a client bundle.

import { cookies } from "next/headers";

import { SESSION_COOKIE, readSession } from "./session";

export class NotLoggedIn extends Error {
  constructor() {
    super("需要登录");
    this.name = "NotLoggedIn";
  }
}

export async function isSignedIn(): Promise<boolean> {
  const store = await cookies();
  return (await readSession(store.get(SESSION_COOKIE)?.value)) !== null;
}

async function requireAdmin(): Promise<void> {
  if (!(await isSignedIn())) throw new NotLoggedIn();
}

export type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Call a backend write endpoint on behalf of the logged-in admin.
 *
 * Returns the parsed body, or null for a 204. A refusal from the backend is
 * rethrown with its own message — "season 2025 is locked" tells a captain what
 * to do; "request failed" does not.
 */
export async function adminWrite(
  method: WriteMethod,
  path: string,
  body?: unknown,
): Promise<unknown> {
  await requireAdmin();

  const base = process.env.BACKEND_URL;
  if (!base) throw new Error("BACKEND_URL is not configured");

  const adminSecret = process.env.ADMIN_SECRET;
  // Fail closed, exactly as the backend does with the same variable: an unset
  // secret means nobody writes, not everybody.
  if (!adminSecret) throw new Error("ADMIN_SECRET is not configured");

  const response = await fetch(`${base}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Backend-Secret": process.env.BACKEND_SECRET ?? "",
      "X-Admin-Secret": adminSecret,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const parsed = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `${method} ${path} failed: ${response.status}`;
    throw new Error(detail);
  }
  return parsed;
}
