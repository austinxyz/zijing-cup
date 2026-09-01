import { describe, expect, it } from "vitest";

import { navItems } from "./nav";

describe("navItems", () => {
  it("lists every destination, admin included", () => {
    const keys = navItems("2025", "silver").map((item) => item.key);
    expect(keys).toEqual(["teams", "lineup", "opponents", "rules", "players"]);
  });

  it("marks 队员管理 as admin so the top bar can drop it", () => {
    const players = navItems("2025", "silver").find((i) => i.key === "players");
    expect(players?.admin).toBe(true);
    // Nothing else is admin — the top bar filters on this one flag.
    const admins = navItems("2025", "silver").filter((i) => i.admin);
    expect(admins).toHaveLength(1);
  });

  it("gives 对手对比 no href because it does not exist yet", () => {
    const opp = navItems("2025", "silver").find((i) => i.key === "opponents");
    expect(opp?.href).toBeNull();
    expect(opp?.pending).toBe(true);
  });

  it("opens 阵容 on the team in scope rather than a picker", () => {
    const lineup = navItems("2025", "silver", "THU").find(
      (i) => i.key === "lineup",
    );
    expect(lineup?.href).toBe("/2025/silver/lineup/THU");
  });

  it("sends 阵容 to the picker when no team is in scope", () => {
    const lineup = navItems("2025", "silver").find((i) => i.key === "lineup");
    expect(lineup?.href).toBe("/2025/silver/lineup");
  });
});
