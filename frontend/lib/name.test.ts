import { describe, expect, it } from "vitest";

import { playerName } from "./name";

describe("playerName", () => {
  it("puts a space between the family name and the given name", () => {
    // 姓 then 名: the committee sheet's Last Name column, then First Name.
    expect(playerName({ last_name: "南", first_name: "望舒" })).toBe("南 望舒");
  });

  it("separates a latin name the committee sheet split the same way", () => {
    // The sheet's Last Name / First Name columns hold whole latin names on
    // some rosters. Joined without a space they read as one word —
    // "GuanpengChen" — which is nobody's name.
    expect(playerName({ last_name: "Li", first_name: "Shen" })).toBe("Li Shen");
  });

  it("does not leave a stray space when one half is missing", () => {
    expect(playerName({ last_name: "南", first_name: "" })).toBe("南");
    expect(playerName({ last_name: "", first_name: "望舒" })).toBe("望舒");
  });

  it("keeps a name that already contains a space intact", () => {
    // "Michael Songzhu" is one given name on a real roster; splitting or
    // collapsing it would rename the player.
    expect(playerName({ last_name: "An", first_name: "Michael Songzhu" })).toBe(
      "An Michael Songzhu",
    );
  });

  it("follows the columns, and does not try to guess which half is the surname", () => {
    // A few 2025 rows are entered the other way round (Guanpeng | Chen) and
    // will read backwards. That is a data-entry problem in the sheet: for
    // mixed Chinese and English names nothing here can tell a surname from a
    // given name, and a heuristic that tried would rename the rows that are
    // currently correct.
    expect(playerName({ last_name: "Guanpeng", first_name: "Chen" })).toBe(
      "Guanpeng Chen",
    );
  });
});
