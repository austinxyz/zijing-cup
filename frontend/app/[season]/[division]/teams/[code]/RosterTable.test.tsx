import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RosterPlayer } from "@/lib/api";
import { RosterTable } from "./RosterTable";

function player(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    last_name: "南",
    first_name: "望舒",
    gender: "M",
    match_utr: "6.50",
    dutr_status: "Rated",
    rating_class: "verified",
    source_note: null,
    daily_utrs: [],
    is_borrowed_player: null,
    utr_profile_id: null,
    ...overrides,
  };
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1); // drop the header row
}

describe("RosterTable", () => {
  it("renders the columns the mock names", () => {
    render(<RosterTable players={[player()]} />);

    for (const heading of ["#", "姓名", "性别", "参赛 UTR", "UTR 来源"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
  });

  it("keeps the order it was given", () => {
    // The backend already returns strongest-first, ties broken by surname.
    // Sorting again here would be a second opinion on the same question, and
    // ties are common — several players sit on the same cap.
    render(
      <RosterTable
        players={[
          player({ last_name: "南", first_name: "望舒", match_utr: "6.50" }),
          player({ last_name: "东", first_name: "方朔", match_utr: "6.50" }),
          player({ last_name: "西", first_name: "门吹雪", match_utr: "7.10" }),
        ]}
      />,
    );

    const names = rows().map((row) => within(row).getAllByRole("cell")[1].textContent);
    expect(names).toEqual(["南望舒", "东方朔", "西门吹雪"]);
  });

  it("numbers the rows in the order shown", () => {
    render(<RosterTable players={[player(), player({ first_name: "方朔" })]} />);

    const numbers = rows().map(
      (row) => within(row).getAllByRole("cell")[0].textContent,
    );
    expect(numbers).toEqual(["1", "2"]);
  });

  it("shows 已认证 with the sheet's own word for a Rated player", () => {
    render(<RosterTable players={[player({ dutr_status: "Rated" })]} />);

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("已认证")).toBeTruthy();
    expect(within(cell).getByText("Rated")).toBeTruthy();
  });

  it("shows 委员会审定 for a Projected player", () => {
    render(
      <RosterTable
        players={[
          player({ dutr_status: "Projected", rating_class: "committee" }),
        ]}
      />,
    );

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("委员会审定")).toBeTruthy();
    expect(within(cell).getByText("Projected")).toBeTruthy();
  });

  it("shows 待定 when nobody has classified the player", () => {
    render(
      <RosterTable
        players={[player({ dutr_status: "Unrated", rating_class: null })]}
      />,
    );

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("待定")).toBeTruthy();
    expect(within(cell).getByText("Unrated")).toBeTruthy();
  });

  it("never labels an unclassified player 自评", () => {
    // Whether an Unrated player is committee-adjudicated or self-rated
    // depends on USTA match history the committee sheet does not carry.
    // Printing a class here would settle who counts against the "at most two
    // self-rated on court, never partnered" cap — a decision this page is in
    // no position to make.
    render(
      <RosterTable
        players={[
          player({ dutr_status: "Unrated", rating_class: null }),
          player({ dutr_status: "Unrated / Appeal", rating_class: null }),
        ]}
      />,
    );

    expect(screen.queryByText(/自评/)).toBeNull();
  });

  it("ignores an / Appeal suffix when naming the class", () => {
    render(
      <RosterTable
        players={[
          player({ dutr_status: "Rated / Appeal", rating_class: "verified" }),
        ]}
      />,
    );

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("已认证")).toBeTruthy();
    // The suffix is evidence of a manual adjustment and must survive whole.
    expect(within(cell).getByText("Rated / Appeal")).toBeTruthy();
  });

  it("shows gender in the sheet's terms", () => {
    render(
      <RosterTable
        players={[player({ gender: "M" }), player({ gender: "F" })]}
      />,
    );

    const genders = rows().map(
      (row) => within(row).getAllByRole("cell")[2].textContent,
    );
    expect(genders).toEqual(["男", "女"]);
  });

  it("leaves the gender cell empty when it is unknown", () => {
    // Not guessed, and not shown as 男 — the column is nullable.
    render(<RosterTable players={[player({ gender: null })]} />);

    expect(within(rows()[0]).getAllByRole("cell")[2].textContent).toBe("");
  });

  it("shows the participation UTR exactly as given", () => {
    // 10.25 and 10.2 are different answers against a cap; the value arrives
    // as a decimal string and must not go through a float.
    render(<RosterTable players={[player({ match_utr: "10.25" })]} />);

    expect(within(rows()[0]).getAllByRole("cell")[3].textContent).toBe("10.25");
  });
});
