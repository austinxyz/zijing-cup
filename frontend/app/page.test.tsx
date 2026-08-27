// frontend/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", () => ({
  getHealth: vi.fn(),
}));

describe("Home page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows backend and DB status once getHealth resolves", async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: "ok", db: "ok" });

    render(await Page());

    expect(screen.getByText(/backend: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/database: ok/i)).toBeInTheDocument();
  });

  it("shows an error message when getHealth rejects", async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error("getHealth failed: 500"));

    render(await Page());

    expect(screen.getByText(/could not reach backend/i)).toBeInTheDocument();
  });
});
