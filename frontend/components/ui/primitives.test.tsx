import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Card, CardDescription, CardHeader, CardTitle } from "./card";
import { Input } from "./input";

describe("Card", () => {
  it("renders a bordered surface with the shared radius token", () => {
    render(<Card data-testid="card">内容</Card>);

    const cls = screen.getByTestId("card").className;
    expect(cls).toMatch(/rounded-token/);
    expect(cls).toMatch(/border-border/);
    expect(cls).toMatch(/bg-surface/);
  });

  it("renders header, title and description as a group", () => {
    render(
      <Card>
        <CardHeader data-testid="header">
          <CardTitle>各线 UTR Cap</CardTitle>
          <CardDescription>一条线两名队员参赛 UTR 之和</CardDescription>
        </CardHeader>
      </Card>,
    );

    expect(screen.getByTestId("header")).toBeInTheDocument();
    // The title is a heading so the rules page's card stack is navigable by
    // screen reader, not just visually grouped.
    expect(
      screen.getByRole("heading", { name: "各线 UTR Cap" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("一条线两名队员参赛 UTR 之和").className,
    ).toMatch(/text-muted/);
  });
});

describe("Badge", () => {
  it("defaults to the primary variant", () => {
    render(<Badge>已认证</Badge>);

    const cls = screen.getByText("已认证").className;
    expect(cls).toMatch(/bg-primary/);
    expect(cls).toMatch(/rounded-token/);
  });

  it("renders the muted, success, danger and warning variants", () => {
    render(
      <>
        <Badge variant="muted">未变</Badge>
        <Badge variant="success">已同步</Badge>
        <Badge variant="danger">自评</Badge>
        <Badge variant="warning">超 0.10</Badge>
      </>,
    );

    expect(screen.getByText("未变").className).toMatch(/bg-surface-muted/);
    expect(screen.getByText("已同步").className).toMatch(/bg-success/);
    expect(screen.getByText("自评").className).toMatch(/bg-danger/);
    // warning carries "legal but costly" — a pair over its cap that eats the
    // shared buffer budget. It must be visually distinct from danger.
    expect(screen.getByText("超 0.10").className).toMatch(/bg-warning/);
  });
});

describe("Input", () => {
  it("renders with the token border, surface and focus ring", () => {
    render(<Input placeholder="搜索球队" />);

    const cls = screen.getByPlaceholderText("搜索球队").className;
    expect(cls).toMatch(/border-border/);
    expect(cls).toMatch(/bg-surface/);
    expect(cls).toMatch(/rounded-token/);
    expect(cls).toMatch(/focus:ring-primary/);
  });

  it("forwards input props", () => {
    render(<Input defaultValue="ZJU" readOnly />);

    const input = screen.getByDisplayValue("ZJU");
    expect(input).toHaveAttribute("readonly");
  });
});

describe("Badge warning-subtle", () => {
  it("uses warning as the text colour, not as a fill", () => {
    // The solid warning badge is for a lineup overage — one or two per
    // screen. 「待定」 appears on every unclassified player (36 of 459 in
    // 2025), and a wall of solid amber would read as a page full of errors
    // when nothing is wrong: nobody has classified those players yet.
    render(<Badge variant="warning-subtle">待定</Badge>);

    const badge = screen.getByText("待定");
    expect(badge.className).toMatch(/text-warning/);
    expect(badge.className).not.toMatch(/bg-warning\b/);
  });
});
