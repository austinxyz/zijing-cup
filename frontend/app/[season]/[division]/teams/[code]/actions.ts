"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "@/lib/admin";
import { getPlayer, getPlayers } from "@/lib/api";
import type { CurrentUtrEdit } from "./RosterTable";

/** Refresh every team page under this competition. The add/remove actions are
 *  addressed by team id, not code, so revalidate the subtree rather than one
 *  path — the roster page re-reads on the client's next refresh. */
function revalidateTeams(season: string, division: string): void {
  revalidatePath(`/${season}/${division}/teams`, "layout");
}

/** A compact search hit for the "add player" control. */
export interface PlayerSearchHit {
  id: number;
  last_name: string;
  first_name: string;
  gender: string | null;
}

/** Search the whole registry (cross-season/division) by name, for adding an
 *  existing player to a team. Blank query returns nothing rather than the whole
 *  roster. */
export async function searchPlayersForAdd(
  query: string,
): Promise<PlayerSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const players = await getPlayers({ query: q });
  return players.map((p) => ({
    id: p.id,
    last_name: p.last_name,
    first_name: p.first_name,
    gender: p.gender,
  }));
}

/** Add an existing player to this team (a new membership). Duplicate (already on
 *  team) and locked-season are 409s from the backend — they surface as the
 *  action's error, not a silent no-op. */
export async function addExistingPlayerToTeam(
  season: string,
  division: string,
  teamId: number,
  playerId: number,
): Promise<void> {
  await adminWrite(
    "POST",
    `/api/players/${playerId}/memberships`,
    { team_id: teamId },
    { season, division },
  );
  revalidateTeams(season, division);
}

/** Create a brand-new global player, then add them to this team. gender ""
 *  becomes null (the backend vocabulary check accepts only M/F/null). */
export async function createAndAddPlayer(
  season: string,
  division: string,
  teamId: number,
  fields: { last_name: string; first_name: string; gender: string },
): Promise<void> {
  const created = (await adminWrite(
    "POST",
    "/api/players",
    {
      last_name: fields.last_name.trim(),
      first_name: fields.first_name.trim(),
      gender: fields.gender ? fields.gender : null,
    },
    { season, division },
  )) as { id: number };
  await addExistingPlayerToTeam(season, division, teamId, created.id);
}

/** Remove a player from this team. The DELETE route is keyed by membership id,
 *  which the roster row does not carry — resolve it via `getPlayer` (each player
 *  has at most one membership per team, so the team id locates it uniquely). The
 *  player, their participation UTR and other teams stay. */
export async function removePlayerFromTeam(
  season: string,
  division: string,
  teamId: number,
  playerId: number,
): Promise<void> {
  const player = await getPlayer(playerId);
  const membership = player?.memberships.find((m) => m.team_id === teamId);
  if (!membership) {
    throw new Error("该队员已不在本队（可能已被移出）");
  }
  await adminWrite(
    "DELETE",
    `/api/players/${playerId}/memberships/${membership.id}`,
    undefined,
    { season, division },
  );
  revalidateTeams(season, division);
}

/**
 * Save one player's current UTR from the roster page.
 *
 * Goes through the same batch endpoint the sheet uses — a batch of one —
 * rather than a second write path with its own rules about what counts as
 * "leave it alone". One rule, one place.
 */
export async function saveCurrentUtr(
  season: string,
  division: string,
  teamCode: string,
  edit: CurrentUtrEdit,
): Promise<void> {
  await adminWrite("PUT", "/api/players/current-utr", {
    // The season travels with the write: while it is unlocked, a new current
    // doubles UTR becomes that season's participation UTR too, which is the
    // only number a lineup can be built from before the committee's arrives.
    season_year: Number(season),
    updates: [edit],
  }, { season, division });
  revalidatePath(`/${season}/${division}/teams/${teamCode}`);
}

/**
 * The team-page batch save: any number of current-UTR edits plus any number of
 * membership flag/school changes plus (optionally) the team's school_count, in
 * as few writes as the changes need. Doubles UTRs go through the same
 * season-mirroring batch endpoint as a single save; each membership change is a
 * PATCH addressed by (player, team); school_count is a PATCH on the team.
 */
export async function saveTeamEdits(
  season: string,
  division: string,
  teamCode: string,
  teamId: number,
  edits: {
    // A subset of the current-UTR fields per player; the batch endpoint treats
    // absent fields as "leave alone". The team page edits the doubles UTR, its
    // status, and the UTR profile link. A cleared value sends null (clear it),
    // never "" (which fails to parse as a Decimal and, being all-or-nothing,
    // would sink the whole batch).
    utrs?: Array<{
      player_id: number;
      doubles_utr?: string | null;
      doubles_status?: string | null;
      utr_profile_id?: string | null;
    }>;
    memberships?: Array<{
      player_id: number;
      is_borrowed_player?: boolean;
      is_wildcard?: boolean;
      representing_school?: string | null;
    }>;
    // Directly-set participation UTRs. Written AFTER the current-UTR batch so an
    // explicit value wins over any doubles→participation mirror that batch does:
    // the admin typed this number for this season, it is not a stand-in.
    seasonUtrs?: Array<{ player_id: number; value: string }>;
    schoolCount?: number | null;
  },
): Promise<void> {
  if (edits.utrs && edits.utrs.length > 0) {
    await adminWrite("PUT", "/api/players/current-utr", {
      season_year: Number(season),
      updates: edits.utrs,
    }, { season, division });
  }
  for (const s of edits.seasonUtrs ?? []) {
    // source "admin_ruling", no status: a hand-set participation value, shown
    // as 待定 on the roster — a stated number, not anybody's rating class. The
    // endpoint 409s if the season is locked; that surfaces as a save error.
    await adminWrite("PUT", `/api/players/${s.player_id}/season-utrs/${season}`, {
      value: s.value,
      source: "admin_ruling",
      status: null,
    }, { season, division });
  }
  for (const m of edits.memberships ?? []) {
    const { player_id, ...fields } = m;
    await adminWrite("PATCH", `/api/players/${player_id}/memberships`, {
      team_id: teamId,
      ...fields,
    }, { season, division });
  }
  if (edits.schoolCount !== undefined) {
    await adminWrite(
      "PATCH",
      `/api/seasons/${season}/divisions/${division}/teams/${encodeURIComponent(teamCode)}`,
      { school_count: edits.schoolCount },
      { season, division },
    );
  }
  revalidatePath(`/${season}/${division}/teams/${teamCode}`);
}
