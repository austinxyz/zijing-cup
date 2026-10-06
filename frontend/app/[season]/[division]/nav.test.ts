import { describe, expect, it } from "vitest";

import { navItems } from "./nav";

describe("navItems", () => {
  it("lists every destination, admin included", () => {
    const keys = navItems("2025", "silver").map((item) => item.key);
    expect(keys).toEqual(["teams", "lineup", "opponents", "rules", "players", "matches"]);
  });

  it("marks 队员管理 as admin so the top bar can drop it", () => {
    const players = navItems("2025", "silver").find((i) => i.key === "players");
    expect(players?.admin).toBe(true);
    // 队员管理 and 比赛历史 are the admin-only destinations the top bar drops.
    const admins = navItems("2025", "silver").filter((i) => i.admin).map((i) => i.key);
    expect(admins).toEqual(["players", "matches"]);
  });

  it("links 对手对比 to the division's compare page", () => {
    const opp = navItems("2025", "silver").find((i) => i.key === "opponents");
    expect(opp?.href).toBe("/2025/silver/compare");
    expect(opp?.pending).toBe(false);
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
