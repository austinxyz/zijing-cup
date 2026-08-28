import { afterEach, describe, expect, it, vi } from "vitest";

import { getSeasons } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("backend requests", () => {
  it("carries an abort signal so a sleeping backend cannot hang the render", async () => {
    // Render's free tier sleeps when idle and can take close to a minute to
    // wake. Without a deadline the Server Component waits until the hosting
    // platform kills the whole function, which surfaces as a blank page
    // rather than the error state.
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSeasons();

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
