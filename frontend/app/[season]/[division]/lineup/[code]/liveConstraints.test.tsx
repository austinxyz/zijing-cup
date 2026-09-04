import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RuleLine } from "@/lib/api";
import { constraintsFromForm, hasLiveConstraints } from "./liveConstraints";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "D2", kind: "mens_doubles", sort_order: 2, cap: "12.00", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
];

function formWith(fields: Record<string, string>, excluded: string[] = []): HTMLFormElement {
  const { container } = render(
    <form>
      {Object.entries(fields).map(([name, value]) => (
        <select key={name} name={name} defaultValue={value} aria-label={name}>
          <option value="" />
          <option value={value}>{value}</option>
        </select>
      ))}
      {["p1", "p2", "p9"].map((k) => (
        <input key={k} type="checkbox" name="ex" value={k} defaultChecked={excluded.includes(k)} />
      ))}
    </form>,
  );
  return container.querySelector("form")!;
}

describe("constraintsFromForm (reads the live controls, not the URL)", () => {
  it("two different picks on a line = a lock", () => {
    const c = constraintsFromForm(formWith({ D1a: "p1", D1b: "p2" }), LINES);
    expect(c.locks).toEqual({ D1: ["p1", "p2"] });
    expect(c.pins).toEqual({});
  });

  it("exactly one pick on a line = a pin", () => {
    const c = constraintsFromForm(formWith({ D2a: "p3", D2b: "" }), LINES);
    expect(c.pins).toEqual({ D2: "p3" });
    expect(c.locks).toEqual({});
  });

  it("captures edits made after load (a fresh pin on an otherwise empty form)", () => {
    const c = constraintsFromForm(formWith({ WDa: "p8" }), LINES);
    expect(c.pins).toEqual({ WD: "p8" });
    expect(hasLiveConstraints(c)).toBe(true);
  });

  it("reads the checked exclusions", () => {
    const c = constraintsFromForm(formWith({}, ["p1", "p9"]), LINES);
    expect(c.excluded.sort()).toEqual(["p1", "p9"]);
  });

  it("empty form has nothing to save", () => {
    expect(hasLiveConstraints(constraintsFromForm(formWith({}), LINES))).toBe(false);
  });
});
