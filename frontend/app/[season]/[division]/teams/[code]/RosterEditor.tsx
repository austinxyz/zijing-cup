"use client";

import { useTransition } from "react";

import type { RosterPlayer } from "@/lib/api";
import { saveCurrentUtr } from "./actions";
import { RosterTable, type CurrentUtrEdit } from "./RosterTable";

/**
 * The roster table, wired to the one write it can make.
 *
 * A thin client boundary around the table rather than making the page itself
 * a client component: the page fetches on the server and stays there.
 */
export function RosterEditor({
  players,
  canEdit,
  locked,
  season,
  division,
  teamCode,
}: {
  players: RosterPlayer[];
  canEdit: boolean;
  /** Whether the season is frozen — drives the overwrite warning in the editor. */
  locked: boolean;
  season: string;
  division: string;
  teamCode: string;
}) {
  const [, startTransition] = useTransition();

  function save(edit: CurrentUtrEdit) {
    startTransition(async () => {
      await saveCurrentUtr(season, division, teamCode, edit);
    });
  }

  return (
    <RosterTable
      players={players}
      canEdit={canEdit}
      locked={locked}
      onSave={save}
    />
  );
}
