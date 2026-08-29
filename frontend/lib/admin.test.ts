// frontend/lib/admin.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueSession } from "./session";

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-signing-secret");
  vi.stubEnv("BACKEND_URL", "http://backend.test");
  vi.stubEnv("BACKEND_SECRET", "s3cr3t");
  vi.stubEnv("ADMIN_SECRET", "admin-secret");
  cookieStore.get.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedIn() {
  cookieStore.get.mockReturnValue({ value: await issueSession() });
}

describe("adminWrite", () => {
  it("refuses before it reaches the network when nobody is logged in", async () => {
    const { NotLoggedIn, adminWrite } = await import("./admin");
    cookieStore.get.mockReturnValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(adminWrite("POST", "/api/players", {})).rejects.toBeInstanceOf(
      NotLoggedIn,
    );
    // Not "the backend said no": the caller needs to know a login would fix
    // this, and the request should not have been made at all.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries both secrets when a session is present", async () => {
    const { adminWrite } = await import("./admin");
    await signedIn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await adminWrite("POST", "/api/players", { last_name: "南" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/api/players");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Backend-Secret"]).toBe("s3cr3t");
    // The admin credential is what the backend's write check reads. It exists
    // only here, on the server.
    expect(init.headers["X-Admin-Secret"]).toBe("admin-secret");
  });

  it("refuses an expired session the same way as no session", async () => {
    const { NotLoggedIn, adminWrite } = await import("./admin");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T00:00:00Z"));
    await signedIn();
    vi.setSystemTime(new Date("2026-08-29T06:00:00Z"));
    vi.stubGlobal("fetch", vi.fn());

    await expect(adminWrite("DELETE", "/api/players/1")).rejects.toBeInstanceOf(
      NotLoggedIn,
    );
    vi.useRealTimers();
  });

  it("surfaces the backend's refusal rather than swallowing it", async () => {
    const { adminWrite } = await import("./admin");
    await signedIn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ detail: "season 2025 is locked" }),
      }),
    );

    await expect(adminWrite("PUT", "/api/players/1/season-utrs/2025", {})).rejects.toThrow(
      /season 2025 is locked/,
    );
  });

  it("refuses to run at all when the admin secret is not configured", async () => {
    const { adminWrite } = await import("./admin");
    await signedIn();
    vi.stubEnv("ADMIN_SECRET", "");
    vi.stubGlobal("fetch", vi.fn());

    // Same fail-closed rule as the backend: an unset secret means nobody
    // writes, not everybody.
    await expect(adminWrite("POST", "/api/players", {})).rejects.toThrow(
      /ADMIN_SECRET/,
    );
  });
});

describe("isSignedIn", () => {
  it("is false without a cookie and true with a fresh one", async () => {
    const { isSignedIn } = await import("./admin");

    cookieStore.get.mockReturnValue(undefined);
    await expect(isSignedIn()).resolves.toBe(false);

    await signedIn();
    await expect(isSignedIn()).resolves.toBe(true);
  });
});

describe("the shared secret is required too", () => {
  it("refuses to write when BACKEND_SECRET is missing", async () => {
    const { adminWrite } = await import("./admin");
    await signedIn();
    vi.stubEnv("BACKEND_SECRET", "");
    vi.stubGlobal("fetch", vi.fn());

    // Sending an empty header would let the request reach the backend and be
    // refused there — indistinguishable, from the outside, from a bad login.
    // A missing secret is a deployment fault and should say so here.
    await expect(adminWrite("POST", "/api/players", {})).rejects.toThrow(
      /BACKEND_SECRET/,
    );
  });
});
