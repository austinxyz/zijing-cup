import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/2025/silver/compare",
  useSearchParams: () => new URLSearchParams("a=PKU&al=1"),
}));

import type { SavedLineup, TeamSummary } from "@/lib/api";
import { CompareControls } from "./CompareControls";

const TEAMS: TeamSummary[] = [
  { code: "PKU", display_name: "北大", player_count: 0, men_count: 0, women_count: 0, unknown_gender_count: 0 },
  { code: "THU", display_name: "清华", player_count: 0, men_count: 0, women_count: 0, unknown_gender_count: 0 },
];
const lineup = (id: number, name: string) => ({ id, name }) as SavedLineup;

afterEach(() => vi.clearAllMocks());

function show(overrides: Partial<Parameters<typeof CompareControls>[0]> = {}) {
  render(
    <CompareControls
      teams={TEAMS}
      lineupsA={[lineup(1, "主力A")]}
      lineupsB={[]}
      sel={{ a: "PKU", al: "1", b: "", bl: "" }}
      {...overrides}
    />,
  );
}

describe("CompareControls", () => {
  it("renders a team + lineup select for each side", () => {
    show();
    expect(screen.getByLabelText("我方队伍")).toBeTruthy();
    expect(screen.getByLabelText("我方阵容")).toBeTruthy();
    expect(screen.getByLabelText("对手队伍")).toBeTruthy();
    expect(screen.getByLabelText("对手阵容")).toBeTruthy();
  });

  it("changing a team pushes the new team and clears that side's lineup id", () => {
    show();
    fireEvent.change(screen.getByLabelText("我方队伍"), { target: { value: "THU" } });
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("a=THU");
    expect(url).not.toContain("al="); // lineup id dropped on team change
  });

  it("selecting a lineup pushes its id", () => {
    show();
    fireEvent.change(screen.getByLabelText("我方阵容"), { target: { value: "1" } });
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("al=1");
  });

  it("disables the lineup select when the side has no team or no lineups", () => {
    show();
    // opponent side: no team chosen → its lineup select is disabled
    expect((screen.getByLabelText("对手阵容") as HTMLSelectElement).disabled).toBe(true);
  });
});
