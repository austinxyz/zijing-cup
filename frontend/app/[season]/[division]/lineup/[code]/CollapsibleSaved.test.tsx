import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollapsibleSaved } from "./CollapsibleSaved";

describe("CollapsibleSaved", () => {
  it("starts expanded and folds/expands on click", () => {
    render(
      <CollapsibleSaved count={2}>
        <div>saved body</div>
      </CollapsibleSaved>,
    );
    // expanded by default
    expect(screen.getByText("saved body")).toBeTruthy();
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    expect(screen.queryByText("saved body")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("saved body")).toBeTruthy();
  });

  it("shows an empty header and cannot expand when there are none", () => {
    render(
      <CollapsibleSaved count={0}>
        <div>saved body</div>
      </CollapsibleSaved>,
    );
    expect(screen.getByText(/还没有保存的阵容/)).toBeTruthy();
    expect(screen.queryByText("saved body")).toBeNull();
    // the header button is disabled — nothing to fold
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  });
});
