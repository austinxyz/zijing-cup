import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UtrImport } from "./UtrImport";

describe("UtrImport", () => {
  it("offers both a paste box and a file", () => {
    render(<UtrImport onSubmit={vi.fn()} />);

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByLabelText(/CSV/)).toBeTruthy();
  });

  it("says the button produces a diff, not a write", () => {
    // 「导入」 on the button would read as "this lands now". It does not: the
    // next screen is where anything is decided.
    render(<UtrImport onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "看差异" })).toBeTruthy();
    expect(screen.getByText(/不会直接写库/)).toBeTruthy();
  });

  it("sends the pasted text through", () => {
    const onSubmit = vi.fn();
    render(<UtrImport onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "id\t姓\n1\t南" },
    });
    fireEvent.click(screen.getByRole("button", { name: "看差异" }));

    expect(onSubmit).toHaveBeenCalledWith("id\t姓\n1\t南");
  });

  it("sends an uploaded file through the same call", async () => {
    // One parser, reached two ways. Two paths that could disagree would leave
    // the reader with no way to tell which result to believe.
    const onSubmit = vi.fn();
    render(<UtrImport onSubmit={onSubmit} />);

    const file = new File(["id,姓\n1,南"], "sheet.csv", { type: "text/csv" });
    const input = screen.getByLabelText(/CSV/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("id,姓\n1,南"),
    );
  });

  it("does not submit an empty box", () => {
    const onSubmit = vi.fn();
    render(<UtrImport onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "看差异" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
