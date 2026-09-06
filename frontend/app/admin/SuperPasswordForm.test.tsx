import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SuperPasswordForm } from "./SuperPasswordForm";

afterEach(() => vi.clearAllMocks());

function setup() {
  const action = vi.fn().mockResolvedValue(undefined);
  render(<SuperPasswordForm action={action} />);
  return action;
}

const pw = () => screen.getByLabelText("新密码");
const confirm = () => screen.getByLabelText("确认密码");
const submit = () => screen.getByRole("button", { name: /设置密码/ });

describe("SuperPasswordForm password confirmation", () => {
  it("renders a confirm field alongside the password field", () => {
    setup();
    expect(pw()).toBeTruthy();
    expect(confirm()).toBeTruthy();
  });

  it("keeps submit disabled until both entries match", () => {
    setup();
    fireEvent.change(pw(), { target: { value: "silver-pw" } });
    fireEvent.change(confirm(), { target: { value: "silver-pX" } });
    // A masked field with no confirm is exactly how a set-time typo stored a
    // password nobody could unlock — a mismatch must not be submittable.
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/两次输入不一致/)).toBeTruthy();
  });

  it("keeps submit disabled when either field is empty", () => {
    setup();
    fireEvent.change(pw(), { target: { value: "only-one" } });
    expect(submit()).toBeDisabled();
  });

  it("enables submit and calls the action once the two match", async () => {
    const action = setup();
    fireEvent.change(pw(), { target: { value: "matching-pw" } });
    fireEvent.change(confirm(), { target: { value: "matching-pw" } });
    expect(submit()).not.toBeDisabled();
    expect(screen.queryByText(/两次输入不一致/)).toBeNull();

    fireEvent.click(submit());
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("2026", "silver", "matching-pw"),
    );
    expect(action).toHaveBeenCalledTimes(1);
  });
});
