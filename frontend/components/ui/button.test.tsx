import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

// These assertions name design tokens on purpose. The rules page and every
// later screen get their colors from the token layer in globals.css, so a
// variant that silently stops resolving to `bg-primary` is a design-system
// regression, not a cosmetic one — asserting on data-* attributes instead
// would let that through.

describe("Button", () => {
  it("renders the primary variant by default", () => {
    render(<Button>搜索阵容</Button>);

    const cls = screen.getByRole("button", { name: "搜索阵容" }).className;
    expect(cls).toMatch(/bg-primary/);
    expect(cls).toMatch(/text-primary-foreground/);
  });

  it("renders the secondary variant against the muted surface", () => {
    render(<Button variant="secondary">取消</Button>);

    const cls = screen.getByRole("button", { name: "取消" }).className;
    expect(cls).toMatch(/bg-surface-muted/);
    expect(cls).toMatch(/border-border/);
  });

  it("renders the ghost variant without a filled background", () => {
    render(<Button variant="ghost">更多</Button>);

    const cls = screen.getByRole("button", { name: "更多" }).className;
    expect(cls).not.toMatch(/bg-primary/);
    expect(cls).toMatch(/hover:bg-surface-muted/);
  });

  it("renders the danger variant", () => {
    render(<Button variant="danger">删除</Button>);

    const cls = screen.getByRole("button", { name: "删除" }).className;
    expect(cls).toMatch(/bg-danger/);
    expect(cls).toMatch(/text-danger-foreground/);
  });

  it("defaults to the md size and honours sm", () => {
    const { rerender } = render(<Button>默认</Button>);
    expect(screen.getByRole("button", { name: "默认" }).className).toMatch(/h-10/);

    rerender(<Button size="sm">小</Button>);
    expect(screen.getByRole("button", { name: "小" }).className).toMatch(/h-8/);
  });

  it("uses the shared radius token rather than a hardcoded radius", () => {
    render(<Button>圆角</Button>);

    expect(screen.getByRole("button", { name: "圆角" }).className).toMatch(
      /rounded-token/,
    );
  });

  it("merges caller classes and forwards button props", () => {
    render(
      <Button className="self-start" disabled>
        禁用
      </Button>,
    );

    const button = screen.getByRole("button", { name: "禁用" });
    expect(button.className).toMatch(/self-start/);
    expect(button).toBeDisabled();
  });
});
