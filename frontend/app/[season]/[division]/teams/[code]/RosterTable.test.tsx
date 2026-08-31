import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RosterPlayer } from "@/lib/api";
import { RosterTable } from "./RosterTable";

function player(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    player_id: 1,
    last_name: "南",
    first_name: "望舒",
    gender: "M",
    match_utr: "6.50",
    origin: "frozen",
    origin_year: 2026,
    is_unresolved: false,
    under_appeal: false,
    dutr_status: null,
    rating_class: "verified",
    source_note: null,
    daily_utrs: [],
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
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

    for (const heading of [
      "#",
      "姓名",
      "性别",
      "参赛 UTR",
      "UTR 来源",
      "当前单打",
      "当前双打",
    ]) {
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
    // Family name, space, given name — the two halves come from separate
    // columns of the committee sheet and are not one word.
    expect(names).toEqual(["南 望舒", "东 方朔", "西 门吹雪"]);
  });

  it("numbers the rows in the order shown", () => {
    render(<RosterTable players={[player(), player({ first_name: "方朔" })]} />);

    const numbers = rows().map(
      (row) => within(row).getAllByRole("cell")[0].textContent,
    );
    expect(numbers).toEqual(["1", "2"]);
  });

  it("shows 已认证 for a verified value", () => {
    render(<RosterTable players={[player({ rating_class: "verified" })]} />);

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("已认证")).toBeTruthy();
  });

  it("shows 委员会审定 for a committee value", () => {
    render(<RosterTable players={[player({ rating_class: "committee" })]} />);

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("委员会审定")).toBeTruthy();
  });

  it("shows 队长评定 for a captain value", () => {
    render(<RosterTable players={[player({ rating_class: "captain" })]} />);

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("队长评定")).toBeTruthy();
  });

  it("shows 待定 when nobody has classified the player", () => {
    render(<RosterTable players={[player({ rating_class: null })]} />);

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("待定")).toBeTruthy();
  });

  it("never labels an unclassified player 自评", () => {
    // Whether an unclassified player is committee-adjudicated or captain-rated
    // depends on USTA match history nobody has recorded. Printing a class here
    // would settle who counts against the "at most two self-rated on court,
    // never partnered" cap — a decision this page is in no position to make.
    render(
      <RosterTable
        players={[
          player({ rating_class: null }),
          player({ rating_class: null, under_appeal: true }),
        ]}
      />,
    );

    expect(screen.queryByText(/自评/)).toBeNull();
  });

  it("never prints the committee sheet's own status word", () => {
    // The registry does not store it. Rendering anything in its place would
    // be inventing evidence for the class beside it.
    render(
      <RosterTable
        players={[
          player({ rating_class: "verified" }),
          player({ rating_class: "committee" }),
          player({ rating_class: null }),
        ]}
      />,
    );

    for (const word of ["Rated", "Projected", "Unrated"]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it("keeps Appeal beside the class rather than replacing it", () => {
    // Any of the three classes can be under appeal — the real sheet had
    // Rated / Appeal, Projected / Appeal and Unrated / Appeal.
    render(
      <RosterTable
        players={[player({ rating_class: "verified", under_appeal: true })]}
      />,
    );

    const cell = within(rows()[0]).getAllByRole("cell")[4];
    expect(within(cell).getByText("已认证")).toBeTruthy();
    expect(within(cell).getByText("· Appeal")).toBeTruthy();
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

describe("RosterTable overflow", () => {
  it("keeps the column labels visible while the rows scroll", () => {
    // The largest 2025 rosters run to 26 players — about 1100px of table in
    // a viewport that does not scroll on its own. Once the header row is
    // gone you cannot tell 参赛 UTR from 当前 anything.
    render(<RosterTable players={[player()]} />);

    const head = screen.getAllByRole("columnheader")[0];
    expect(head.className).toMatch(/sticky/);
  });
});

describe("derived participation UTRs", () => {
  it("names the year it derived from", () => {
    // 「估算」 alone would flatten two different degrees of confidence:
    // deriving 2026 from 2025 and from 2023 are not the same claim.
    render(
      <RosterTable
        players={[player({ origin: "prior_season", origin_year: 2025 })]}
      />,
    );

    expect(screen.getByText("估算 · 2025 参赛值")).toBeTruthy();
  });

  it("marks a value taken from the current doubles rating", () => {
    render(
      <RosterTable
        players={[player({ origin: "current_doubles", origin_year: null })]}
      />,
    );

    expect(screen.getByText("估算 · 当前已认证值")).toBeTruthy();
  });

  it("puts the estimate on the warning tier, not danger", () => {
    // An estimate is unconfirmed, not wrong.
    render(
      <RosterTable
        players={[player({ origin: "prior_season", origin_year: 2025 })]}
      />,
    );

    const badge = screen.getByText("估算 · 2025 参赛值");
    expect(badge.className).toMatch(/warning/);
    expect(badge.className).not.toMatch(/danger/);
  });

  it("leaves a frozen value unmarked", () => {
    render(<RosterTable players={[player({ origin: "frozen" })]} />);

    expect(screen.queryByText(/估算/)).toBeNull();
  });

  it("does not rely on className to override a variant's colour", () => {
    // `cn` is a plain join, not tailwind-merge: two colour classes of equal
    // specificity are settled by stylesheet order, so overriding a variant
    // this way fails silently. The no-value chip must carry a variant whose
    // own text colour is legible.
    render(
      <RosterTable
        players={[player({ match_utr: null, origin: null, origin_year: null })]}
      />,
    );

    const chip = within(rows()[0])
      .getAllByRole("cell")[3]
      .querySelector("span.inline-flex") as HTMLElement;
    expect(chip.textContent).toBe("无参赛 UTR");
    expect(chip.className).not.toMatch(/text-muted[^-]/);
  });

  it("says so when there is no value at all", () => {
    // He is on the team, so he is on the roster. A blank cell would read as
    // a broken page and a 0 would read as a real — very low — rating.
    render(
      <RosterTable
        players={[player({ match_utr: null, origin: null, origin_year: null })]}
      />,
    );

    const cell = screen.getByText("无参赛 UTR");
    expect(cell.className).not.toMatch(/warning/);
  });
});

describe("current UTRs", () => {
  it("shows the value with the word UTR itself uses", () => {
    render(
      <RosterTable
        players={[
          player({
            singles_utr: "6.90",
            singles_status: "rated",
            doubles_utr: "6.72",
            doubles_status: "projected",
          }),
        ]}
      />,
    );

    const cells = within(rows()[0]).getAllByRole("cell");
    expect(within(cells[5]).getByText("6.90")).toBeTruthy();
    expect(within(cells[5]).getByText("rated")).toBeTruthy();
    expect(within(cells[6]).getByText("6.72")).toBeTruthy();
    expect(within(cells[6]).getByText("projected")).toBeTruthy();
  });

  it("shows a dash rather than nothing when unfilled", () => {
    // Today that is every player. A blank cell reads as a broken column.
    render(<RosterTable players={[player()]} />);

    const cells = within(rows()[0]).getAllByRole("cell");
    expect(within(cells[5]).getByText("—")).toBeTruthy();
    expect(within(cells[6]).getByText("—")).toBeTruthy();
  });

  it("says the column is maintained by hand", () => {
    // A number that looks official gets used as official. These come from
    // someone typing them into the admin screens, and nothing syncs them.
    render(<RosterTable players={[player()]} />);

    const note = screen.getByText("当前 UTR 由人工维护，未与 UTR 官网同步");
    expect(note.className).not.toMatch(/warning|danger/);
  });

  it("keeps the note when the whole column is empty", () => {
    render(<RosterTable players={[player(), player()]} />);

    expect(
      screen.getByText("当前 UTR 由人工维护，未与 UTR 官网同步"),
    ).toBeTruthy();
  });
});
