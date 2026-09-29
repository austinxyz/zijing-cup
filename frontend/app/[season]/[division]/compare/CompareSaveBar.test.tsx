import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CompareSaveBar } from "./CompareSaveBar";

function setup(over: Partial<Parameters<typeof CompareSaveBar>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <CompareSaveBar
      selection={{ a: "PKU", al: "1", b: "THU", bl: "2" }}
      onSave={onSave}
      {...over}
    />,
  );
  return { onSave };
}

describe("CompareSaveBar", () => {
  it("saves the current selection under the typed name", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "打 THU 预案" } });
    fireEvent.click(screen.getByRole("button", { name: "保存对比" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "打 THU 预案",
      team_a_code: "PKU",
      lineup_a_id: 1,
      team_b_code: "THU",
      lineup_b_id: 2,
    });
  });

  it("does not save when the name is blank", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "保存对比" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("is not shown until both sides are fully selected", () => {
    const { onSave } = setup({ selection: { a: "PKU", al: "1", b: "", bl: "" } });
    expect(screen.queryByRole("button", { name: "保存对比" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
