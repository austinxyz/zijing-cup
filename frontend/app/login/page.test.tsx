import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOGIN_ATTEMPTS, hashPassword, resetRateLimit } from "@/lib/session";
import Page from "./page";
import { LoginForm } from "./LoginForm";

const cookieStore = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
  headers: () => Promise.resolve(new Map([["x-forwarded-for", "9.9.9.9"]])),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-signing-secret");
  vi.stubEnv("ADMIN_PASSWORD_HASH", hashPassword("correct-horse"));
  resetRateLimit();
  cookieStore.set.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the login page", () => {
  it("says what logging in is for, and offers the one control", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText("只有管理员可以修改队员数据。读取页面不需要登录，也不受影响。"),
    ).toBeTruthy();
    expect(screen.getByLabelText("口令")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
  });

  it("does not render a sidebar", async () => {
    const { container } = render(await Page({ searchParams: Promise.resolve({}) }));

    // Nothing behind the login is reachable, so a sidebar here would be a set
    // of controls that all lead back to this page.
    expect(container.querySelector("aside")).toBeNull();
  });

  it("shows why a failed attempt failed, and how many are left", () => {
    render(<LoginForm error="bad-password" remaining={3} />);

    expect(screen.getByText(/口令不对/)).toBeTruthy();
    // A limit the server keeps to itself reads as "my password stopped
    // working": the user retries until they are locked out.
    expect(screen.getByText(/还可以试 3 次/)).toBeTruthy();
  });

  it("says when the attempts have run out, not just that it failed", () => {
    render(<LoginForm error="rate-limited" remaining={0} />);

    expect(screen.getByText(/需要等/)).toBeTruthy();
  });

  it("shows no error before anything has been tried", () => {
    render(<LoginForm />);

    expect(screen.queryByText(/口令不对/)).toBeNull();
  });
});

describe("the login action", () => {
  it("issues an httpOnly session cookie for the right password", async () => {
    const { login } = await import("./actions");
    const form = new FormData();
    form.set("password", "correct-horse");

    await expect(login(undefined, form)).rejects.toThrow(/NEXT_REDIRECT/);

    const [name, , options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("zj_admin");
    // httpOnly or the token is readable by any script on the page.
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
  });

  it("sets no cookie for a wrong password and counts the attempt", async () => {
    const { login } = await import("./actions");
    const form = new FormData();
    form.set("password", "wrong");

    const result = await login(undefined, form);

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(result.error).toBe("bad-password");
    expect(result.remaining).toBe(LOGIN_ATTEMPTS - 1);
  });

  it("stops accepting attempts once the allowance is gone", async () => {
    const { login } = await import("./actions");
    const form = new FormData();
    form.set("password", "wrong");
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) await login(undefined, form);

    const right = new FormData();
    right.set("password", "correct-horse");
    const result = await login(undefined, right);

    // Even the correct password waits: otherwise the limit only slows down
    // someone who is already guessing wrong.
    expect(result.error).toBe("rate-limited");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
