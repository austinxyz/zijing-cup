// frontend/lib/api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "./api";

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the parsed health payload on success", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", db: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getHealth();

    expect(result).toEqual({ status: "ok", db: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/health",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("throws when the backend responds with a non-2xx status", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getHealth()).rejects.toThrow("getHealth failed: 500");
  });

  it("throws a clear error when BACKEND_URL is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(getHealth()).rejects.toThrow("BACKEND_URL is not configured");
  });
});
