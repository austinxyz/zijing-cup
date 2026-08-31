import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins the classes it is given", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy entries", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later class win over an earlier one that sets the same thing", () => {
    // The whole reason components take a `className`: a caller passes one to
    // override what a variant baked in. Plain concatenation leaves both in
    // place at equal specificity, so the winner is decided by the order the
    // rules happen to sit in the stylesheet — which the caller cannot see and
    // did not choose. It fails silently, and it has: a Badge rendered
    // `text-muted` (4.09:1 contrast) while its caller asked for
    // `text-foreground`.
    expect(cn("text-muted", "text-foreground")).toBe("text-foreground");
  });

  it("keeps classes that do not conflict", () => {
    expect(cn("px-2 text-muted", "text-foreground")).toBe(
      "px-2 text-foreground",
    );
  });

  it("understands this project's own colour tokens", () => {
    // `foreground`, `muted` and `warning` are theme colours, not Tailwind's
    // built-in palette. A merge that only recognised `text-red-500` would
    // leave both of these standing and we would be back where we started.
    expect(cn("text-warning", "text-foreground")).toBe("text-foreground");
    expect(cn("bg-surface-muted", "bg-surface")).toBe("bg-surface");
    expect(cn("border-warning-border", "border-border")).toBe("border-border");
  });
});
