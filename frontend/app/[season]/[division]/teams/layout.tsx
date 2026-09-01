import { notFound } from "next/navigation";

import { getDivisionTeams } from "@/lib/api";
import { SelectedTeamList } from "./SelectedTeamList";
import { TeamsPanes } from "./TeamsPanes";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ season: string; division: string }>;
}

/**
 * The team column, shared by the index and every team's roster.
 *
 * It lives in the layout for the same reason the sidebar does: `error.tsx`
 * under `teams/[code]` replaces what sits below it, so a failed roster fetch
 * takes out the roster and leaves the list — and the list is how you get to
 * another team, which is exactly what you want after one fails to load.
 * Selecting a team also does not remount it.
 */
export default async function TeamsLayout({ children, params }: LayoutProps) {
  const { season, division } = await params;

  const teams = await getDivisionTeams(season, division);
  if (teams === null) notFound();

  // TeamsPanes owns the row and the narrow-viewport show/hide; each page still
  // decides what scrolls inside it, so a page keeps its own header fixed while
  // its body moves.
  return (
    <TeamsPanes
      list={
        <SelectedTeamList season={season} division={division} teams={teams} />
      }
    >
      {children}
    </TeamsPanes>
  );
}
