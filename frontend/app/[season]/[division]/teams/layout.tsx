import { notFound } from "next/navigation";

import { getDivisionTeams } from "@/lib/api";
import { SelectedTeamList } from "./SelectedTeamList";

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

  return (
    <div className="flex flex-1 min-h-0">
      <SelectedTeamList season={season} division={division} teams={teams} />
      <main className="flex flex-1 min-w-0 flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
