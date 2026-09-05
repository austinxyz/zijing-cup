import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    is_wildcard: null,
    representing_school: null,
    utr_profile_id: null,
    wins: null,
    losses: null,
    ...overrides,
  };
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("row").slice(1); // drop the header row
}

/** The desktop table. The mobile card list renders the same content, so
 *  content assertions scope here to avoid matching both DOMs. */
function table() {
  return within(screen.getByRole("table"));
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
      "当前双打",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
    // 当前单打 is intentionally not shown on the team page.
    expect(screen.queryByRole("columnheader", { name: "当前单打" })).toBeNull();
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

    expect(table().getByText("估算 · 2025 参赛值")).toBeTruthy();
  });

  it("marks a value taken from the current doubles rating", () => {
    render(
      <RosterTable
        players={[player({ origin: "current_doubles", origin_year: null })]}
      />,
    );

    expect(table().getByText("估算 · 当前已认证值")).toBeTruthy();
  });

  it("puts the estimate on the warning tier, not danger", () => {
    // An estimate is unconfirmed, not wrong.
    render(
      <RosterTable
        players={[player({ origin: "prior_season", origin_year: 2025 })]}
      />,
    );

    const badge = table().getByText("估算 · 2025 参赛值");
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

    const cell = table().getByText("无参赛 UTR");
    expect(cell.className).not.toMatch(/warning/);
  });
});

describe("current UTRs", () => {
  it("shows the value with the word UTR itself uses", () => {
    // 当前单打 is not shown on the team page; only 当前双打 (cells[5]).
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
    expect(within(cells[5]).getByText("6.72")).toBeTruthy();
    expect(within(cells[5]).getByText("projected")).toBeTruthy();
    // The singles value is not rendered anywhere in the row.
    expect(within(rows()[0]).queryByText("6.90")).toBeNull();
  });

  it("shows a dash rather than nothing when unfilled", () => {
    // Today that is every player. A blank cell reads as a broken column.
    render(<RosterTable players={[player()]} />);

    const cells = within(rows()[0]).getAllByRole("cell");
    expect(within(cells[5]).getByText("—")).toBeTruthy();
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

describe("editing one player's current UTR in place", () => {
  it("offers a way in on every row when signed in", () => {
    render(<RosterTable players={[player(), player({ player_id: 2 })]} canEdit />);

    expect(screen.getAllByRole("button", { name: "改" })).toHaveLength(2);
  });

  it("turns just that row into inputs", () => {
    // One player at a time. Editing several at once is what the batch sheet
    // is for, and two routes to the same job leave nobody sure which to use.
    render(<RosterTable players={[player(), player({ player_id: 2 })]} canEdit />);

    fireEvent.click(screen.getAllByRole("button", { name: "改" })[0]);

    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "改" })).toHaveLength(1);
  });

  it("hands the save the player's id, not their name", () => {
    const onSave = vi.fn();
    render(<RosterTable players={[player({ player_id: 42 })]} canEdit onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "改" }));
    fireEvent.change(screen.getAllByRole("spinbutton")[1], {
      target: { value: "6.40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: 42, doubles_utr: "6.40" }),
    );
  });

  it("shows no way in at all when signed out", () => {
    // Hiding the control is only half of it — the write endpoint refuses an
    // unauthenticated caller regardless. This half keeps the page from
    // offering a control that cannot work.
    render(<RosterTable players={[player()]} />);

    expect(screen.queryByRole("button", { name: "改" })).toBeNull();
  });

  it("still shows the roster when signed out", () => {
    render(<RosterTable players={[player()]} />);

    expect(table().getByText("南 望舒")).toBeTruthy();
  });
});

describe("filling in a UTR should take one field, not two", () => {
  it("starts the status at rated so only the number needs typing", () => {
    // 已认证 is what a hand-checked number almost always is. Making the person
    // pick it every time is a second field for a decision they already made.
    render(<RosterTable players={[player()]} canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "改" }));

    const status = screen.getByLabelText("当前双打状态") as HTMLSelectElement;
    expect(status.value).toBe("rated");
  });

  it("keeps a status the player already has", () => {
    render(
      <RosterTable
        players={[player({ doubles_utr: "6.10", doubles_status: "projected" })]}
        canEdit
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "改" }));

    const status = screen.getByLabelText("当前双打状态") as HTMLSelectElement;
    expect(status.value).toBe("projected");
  });

  it("sends rated along with a number typed into an empty row", () => {
    const onSave = vi.fn();
    render(<RosterTable players={[player({ player_id: 7 })]} canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "改" }));
    fireEvent.change(screen.getByLabelText("当前双打"), {
      target: { value: "6.40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ doubles_utr: "6.40", doubles_status: "rated" }),
    );
  });
});

describe("RosterTable mobile cards", () => {
  function cards() {
    return within(screen.getByTestId("roster-cards"));
  }

  it("renders a card list, not a second table", () => {
    render(<RosterTable players={[player()]} />);
    const list = screen.getByTestId("roster-cards");
    expect(list.querySelector("table")).toBeNull();
  });

  it("shows the participation UTR and its source on each card", () => {
    render(
      <RosterTable
        players={[
          player({ match_utr: "6.35", origin: "prior_season", origin_year: 2025 }),
        ]}
      />,
    );
    expect(cards().getByText("6.35")).toBeTruthy();
    expect(cards().getByText("估算 · 2025 参赛值")).toBeTruthy();
  });

  it("drops the current singles and doubles columns", () => {
    render(
      <RosterTable
        players={[player({ singles_utr: "6.1", doubles_utr: "6.2" })]}
      />,
    );
    // The card carries the participation UTR only; the live values live behind
    // the UTR profile link now, not in a column too narrow to read.
    expect(cards().queryByText("6.1")).toBeNull();
    expect(cards().queryByText("6.2")).toBeNull();
  });

  it("keeps a player with no participation UTR as a card, not a gap", () => {
    render(<RosterTable players={[player({ match_utr: null, origin: null })]} />);
    // He is on the team; dropping him would make the roster count and the
    // card count disagree with nothing on screen to say why.
    expect(cards().getByText("无参赛 UTR")).toBeTruthy();
  });
})

describe("RosterTable UTR profile links", () => {
  it("links a player's name to their UTR profile when the id is set", () => {
    render(<RosterTable players={[player({ utr_profile_id: "3872011" })]} />);
    // Both DOMs carry the name; every occurrence with an id should be a link.
    const links = screen.getAllByRole("link", { name: "南 望舒" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(
        "https://app.utrsports.net/profiles/3872011",
      );
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("leaves the name as plain text when no id is set", () => {
    render(<RosterTable players={[player({ utr_profile_id: null })]} />);
    expect(screen.queryByRole("link", { name: "南 望舒" })).toBeNull();
  });
})

describe("RosterTable mobile editing", () => {
  function cards() {
    return within(screen.getByTestId("roster-cards"));
  }

  it("offers an edit control on each card for a signed-in admin", () => {
    render(<RosterTable players={[player({ player_id: 5 })]} canEdit />);
    const edit = cards().getByRole("button", { name: /改/ });
    // A touch target, not the desktop 20px button.
    expect(edit.className).toMatch(/h-11\b/);
  });

  it("shows no edit control on a card when not signed in", () => {
    render(<RosterTable players={[player()]} />);
    expect(cards().queryByRole("button", { name: /改/ })).toBeNull();
  });

  it("opens a drawer that saves the id, never the name", () => {
    const onSave = vi.fn();
    render(
      <RosterTable players={[player({ player_id: 9 })]} canEdit onSave={onSave} />,
    );
    fireEvent.click(cards().getByRole("button", { name: /改/ }));
    // The drawer's field is labelled and 44px; fill the doubles value and save.
    const field = screen.getByLabelText("当前双打") as HTMLInputElement;
    expect(field.className).toMatch(/h-11\b/);
    fireEvent.change(field, { target: { value: "6.30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: 9, doubles_utr: "6.30" }),
    );
  });
})

describe("RosterTable overwrite warning by lock state", () => {
  function openDrawer() {
    fireEvent.click(
      within(screen.getByTestId("roster-cards")).getByRole("button", {
        name: /改/,
      }),
    );
  }

  it("warns that saving overwrites the participation UTR while unlocked", () => {
    render(<RosterTable players={[player()]} canEdit locked={false} />);
    openDrawer();
    expect(screen.getByText(/参赛 UTR 一并改成同一个值/)).toBeTruthy();
  });

  it("drops the warning once the season is locked", () => {
    // Locked means the backend refuses the write, so the sentence would be
    // false — a wrong label is worse than none.
    render(<RosterTable players={[player()]} canEdit locked={true} />);
    openDrawer();
    expect(screen.queryByText(/参赛 UTR 一并改成同一个值/)).toBeNull();
  });
})

describe("RosterTable edit drawer semantics", () => {
  function openDrawer() {
    fireEvent.click(
      within(screen.getByTestId("roster-cards")).getByRole("button", {
        name: /改/,
      }),
    );
  }

  it("is a labelled modal dialog", () => {
    render(<RosterTable players={[player()]} canEdit />);
    openDrawer();
    // Accessible name comes from the on-screen title via aria-labelledby.
    const dialog = screen.getByRole("dialog", { name: /南 望舒/ });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes on Escape without saving", () => {
    const onSave = vi.fn();
    render(<RosterTable players={[player()]} canEdit onSave={onSave} />);
    openDrawer();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("takes numbers in the value fields, like the desktop editor", () => {
    render(<RosterTable players={[player()]} canEdit />);
    openDrawer();
    expect(
      (screen.getByLabelText("当前双打") as HTMLInputElement).type,
    ).toBe("number");
    expect(
      (screen.getByLabelText("当前单打") as HTMLInputElement).type,
    ).toBe("number");
  });
})

describe("RosterTable win/loss column", () => {
  it("has a 胜率 header", () => {
    render(<RosterTable players={[player()]} />);
    // Appears twice: the desktop table header and the mobile card label.
    expect(screen.getAllByText("胜率").length).toBeGreaterThanOrEqual(1);
  });

  it("shows record and percentage for a real record (desktop + mobile)", () => {
    render(<RosterTable players={[player({ wins: 67, losses: 20 })]} />);
    // Both the table and the card list render it — hence getAllByText.
    expect(screen.getAllByText("67-20").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/77%/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows an em dash when the record was never imported", () => {
    render(<RosterTable players={[player({ wins: null, losses: null })]} />);
    // No 0-0 and no 0%: unknown must not read as a real 0 record.
    expect(screen.queryByText("0-0")).toBeNull();
    expect(screen.queryByText(/0%/)).toBeNull();
  });

  it("shows 0-0 without a percentage for a real 0-0 record", () => {
    render(<RosterTable players={[player({ wins: 0, losses: 0 })]} />);
    expect(screen.getAllByText("0-0").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/0%/)).toBeNull();
  });
})
