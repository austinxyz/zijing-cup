// server-only module: never import this from a "use client" component.
function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL;
  if (!base) throw new Error("BACKEND_URL is not configured");
  return `${base}${path}`;
}

// Render's free tier sleeps when idle and can take close to a minute to wake,
// so a request has to be allowed to wait — but not forever. Without a
// deadline the Server Component blocks until the hosting platform kills the
// whole function, and the visitor gets a blank page instead of the error
// state we render for exactly this case. 30s leaves room for a cold start
// while staying inside a typical serverless function limit.
const BACKEND_TIMEOUT_MS = 30_000;

function backendRequestInit(): RequestInit {
  return {
    cache: "no-store",
    headers: { "X-Backend-Secret": process.env.BACKEND_SECRET ?? "" },
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  };
}

export interface HealthStatus {
  status: string;
  db: string;
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(backendUrl("/health"), backendRequestInit());
  if (!res.ok) throw new Error(`getHealth failed: ${res.status}`);
  return res.json();
}

export interface DivisionSummary {
  code: string;
  display_name: string;
}

export interface SeasonIndex {
  year: number;
  edition_name: string | null;
  divisions: DivisionSummary[];
}

export async function getSeasons(): Promise<SeasonIndex[]> {
  const res = await fetch(backendUrl("/api/seasons"), backendRequestInit());
  if (!res.ok) throw new Error(`getSeasons failed: ${res.status}`);
  return res.json();
}

export interface RuleLine {
  code: string;
  kind: string;
  sort_order: number;
  /** null means an open line: no ceiling at all, not a high one. */
  cap: string | null;
  points: number;
}

export interface EligibilityLimit {
  gender: string;
  utr_above: string;
  max_players: number;
  /** null means any line. */
  restricted_to_lines: string[] | null;
}

export interface DivisionRules {
  season: { year: number; edition_name: string | null };
  division: {
    code: string;
    display_name: string;
    scoring_mode: string;
    buffer_per_line: string;
    buffer_total: string;
    partner_gap_max: string;
    mens_doubles_must_be_ordered: boolean;
  };
  lines: RuleLine[];
  eligibility_limits: EligibilityLimit[];
}

/**
 * One division's rules, or null when that season/division pair does not exist.
 *
 * A missing rule set is an ordinary answer here, not a failure: the page asks
 * for the previous season to build its comparison, and the earliest season on
 * record simply has none. Other failures still throw.
 */
export async function getDivisionRules(
  year: number | string,
  code: string,
): Promise<DivisionRules | null> {
  const res = await fetch(
    backendUrl(`/api/seasons/${year}/divisions/${code}/rules`),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getDivisionRules failed: ${res.status}`);
  return res.json();
}

export interface TeamSummary {
  code: string;
  /** null when nobody has named this team. Not a fallback for the code — the
   *  UI decides how to present an unnamed team. */
  display_name: string | null;
  player_count: number;
  /** Fielding a lineup needs one woman for mixed doubles and two for
   *  women's, so at least three on court. Which teams sit near that floor is
   *  what this breakdown is for. */
  men_count: number;
  women_count: number;
  /** Its own bucket: gender is nullable, and folding an unknown into either
   *  side would invent a player there. */
  unknown_gender_count: number;
}

/**
 * A division's teams, or null when that season/division pair does not exist.
 *
 * null and an empty array are different answers: the first means the URL
 * names nothing, the second that the division exists and has no teams.
 */
export async function getDivisionTeams(
  year: number | string,
  code: string,
): Promise<TeamSummary[] | null> {
  const res = await fetch(
    backendUrl(`/api/seasons/${year}/divisions/${code}/teams`),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getDivisionTeams failed: ${res.status}`);
  return res.json();
}

export interface RosterPlayer {
  /** The player's own id — how anything that is not a human refers to this
   *  person. Names repeat. */
  player_id: number;
  last_name: string;
  first_name: string;
  gender: string | null;
  /** The participation UTR: the only number a lineup is checked against.
   *  null together with `origin` when nothing could be derived — he is on the
   *  team, so he is on the roster, and there is no number to show. Never 0:
   *  0 is a legal UTR and a reader could not tell the two apart. */
  match_utr: string | null;
  /** "frozen" | "current_doubles" | "prior_season", or null with `match_utr`.
   *  Anything but "frozen" is derived and must be presented as such. */
  origin: string | null;
  /** The season the value came from. null for "current_doubles", which is not
   *  a season value. */
  origin_year: number | null;
  /** The season value has two candidates and nobody has ruled between them;
   *  the larger is the one shown. */
  is_unresolved: boolean;
  /** Rides on top of `rating_class` rather than replacing it: any of the
   *  three classes can be under appeal. */
  under_appeal: boolean;
  /** Always null. The registry does not store the sheet's own status word.
   *  Kept so the response shape is unchanged — do not read a fact out of it:
   *  null here means "not stored any more", not "the sheet said nothing". */
  dutr_status: string | null;
  /** "verified" | "committee" | "captain", or null when nobody has decided.
   *  Not a default: an Unrated player could be committee-adjudicated or
   *  captain-rated depending on USTA history the sheet does not carry. */
  rating_class: string | null;
  /** Always null, for the same reason as `dutr_status`. */
  source_note: string | null;
  /** Always empty, for the same reason as `dutr_status`. */
  daily_utrs: string[];
  /** The player's live UTRs, each with the word UTR itself uses. These are
   *  the input to step two of the derivation chain: without them a reader
   *  cannot tell why an estimate landed where it did. Maintained by hand in
   *  the admin screens — nothing syncs them — and today all null. */
  singles_utr: string | null;
  singles_status: string | null;
  doubles_utr: string | null;
  doubles_status: string | null;
  /** null means nobody has marked this player — not "confirmed not one". */
  is_borrowed_player: boolean | null;
  utr_profile_id: string | null;
}

export interface UtrSheetRow {
  /** The row's identity. It goes out with the sheet and comes back
   *  untouched, so importing never has to work out which player a row is
   *  about — the one judgement this feature refuses to make, because a
   *  current UTR on the wrong person looks perfectly ordinary on every
   *  screen. */
  player_id: number;
  last_name: string;
  first_name: string;
  singles_utr: string | null;
  singles_status: string | null;
  doubles_utr: string | null;
  doubles_status: string | null;
  utr_profile_id: string | null;
}

export interface TeamRoster {
  team: {
    code: string;
    display_name: string | null;
    season_year: number;
    division_code: string;
  };
  /** Already ordered by participation UTR, strongest first. Do not re-sort:
   *  ties are common (players sit on the same cap) and a second sort would
   *  disagree with this one. */
  players: RosterPlayer[];
  /** Whether the season is frozen. While false, saving a current doubles UTR
   *  also overwrites the participation UTR, and the editor says so; once true
   *  the backend refuses that write, so the warning must not show. */
  locked: boolean;
}

/** The rows a team's UTR sheet is built from, or null when there is no such
 *  team. Ordered exactly as the roster page orders it — the person exports
 *  this while looking at that page, and a different order would read as
 *  having exported the wrong team. */
export async function getUtrSheet(
  year: number | string,
  code: string,
  teamCode: string,
): Promise<UtrSheetRow[] | null> {
  const res = await fetch(
    backendUrl(
      `/api/seasons/${year}/divisions/${code}/teams/` +
        `${encodeURIComponent(teamCode)}/utr-sheet`,
    ),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getUtrSheet failed: ${res.status}`);
  return res.json();
}

/** One team's roster, or null when the season, division or team is unknown. */
export async function getTeamRoster(
  year: number | string,
  code: string,
  teamCode: string,
): Promise<TeamRoster | null> {
  const res = await fetch(
    backendUrl(
      `/api/seasons/${year}/divisions/${code}/teams/` +
        `${encodeURIComponent(teamCode)}/roster`,
    ),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getTeamRoster failed: ${res.status}`);
  return res.json();
}

export interface LineupPlayer {
  /** The key a lock or exclusion sends back. Names repeat on a real roster,
   *  so they cannot identify a player. */
  key: string;
  last_name: string;
  first_name: string;
  /** Shown on every candidate: the high-UTR limits are written per gender,
   *  so a lineup without it cannot be checked against that rule by eye. */
  gender: string | null;
  match_utr: string;
  /** "frozen" | "current_doubles" | "prior_season". A derived number sits
   *  exactly where its size puts it, so without a mark on the number itself
   *  nothing on the card distinguishes it from one the committee froze. */
  origin: string;
  /** The season the value came from; null for "current_doubles". */
  origin_year: number | null;
  /** The season value has two candidates and nobody has ruled; the larger is
   *  the one in play. */
  is_unresolved: boolean;
}

export interface LineTotal {
  total: string;
  /** null on an open line: no ceiling at all, so nothing to exceed. */
  cap: string | null;
  over: string;
}

export interface LineupCandidate {
  total: string;
  buffer_spent: string;
  lines: Record<string, [LineupPlayer, LineupPlayer]>;
  line_totals: Record<string, LineTotal>;
}

export interface LineupViolation {
  code: string;
  line: string | null;
  amount: string | null;
  message: string;
}

/** A named player and where the current input has put them: a line code, or
 *  "excluded". Read straight off the request. */
export interface LineupPlacedPlayer {
  name: string;
  where: string;
}

/** Why one line's candidate pool is empty. `kind` is one of
 *  "gender_shortage" | "over_cap" | "over_gap" | "eligibility". `attributed`
 *  names players an exclude or lock-elsewhere accounts for — non-empty only
 *  for gender_shortage; the rule/attribute reasons are never the user's doing. */
export interface LineupInfeasibilityReason {
  kind: string;
  message: string;
  attributed: LineupPlacedPlayer[];
}

/** The reasons the infeasible line ran dry. A read of the pool, never a claim
 *  about which lock is to blame. `line === infeasible_line`. */
export interface LineupInfeasibility {
  line: string;
  reasons: LineupInfeasibilityReason[];
}

export interface LineupSearch {
  /** Already deduplicated by the ten on court and ordered strongest first.
   *  Do not re-sort: ties are the common case and a second sort would pick a
   *  different winner every render. */
  candidates: LineupCandidate[];
  /** The best total reachable under these locks and exclusions. */
  ceiling: string | null;
  squads_at_ceiling: number;
  /** False when ties were pruned, which makes the count a lower bound. */
  squads_at_ceiling_exact: boolean;
  /** Every line at its cap plus the team buffer; null when a line is open,
   *  because then no such maximum exists. */
  rules_ceiling: string | null;
  /** Set when a line has no legal pair at all — a different answer from an
   *  empty candidate list, which reads as "searched, found nothing". */
  infeasible_line: string | null;
  /** The richer form of infeasible_line: why that line's pool is empty, and
   *  attribution to the user's own excludes/locks where the input shows it.
   *  null when the search is feasible. line === infeasible_line. */
  infeasibility: LineupInfeasibility | null;
  /** Where each unavailable player is: a line code, or "excluded". Read off
   *  the request — never a claim about which lock caused the dead end. */
  placements: Record<string, string>;
  truncated: boolean;
  /** Always false. The per-match borrowed-player ceiling depends on how many
   *  schools a team combines, which the system does not know. */
  borrowed_players_checked: boolean;
  invalid_locks: LineupViolation[];
  roster: LineupPlayer[];
  /** On the team but with no derivable participation UTR, so not in the
   *  search at all. Reported rather than dropped: the ceiling and every
   *  candidate are computed over the rest. */
  missing_utr_count: number;
  /** How many players in the search are playing on a derived number. */
  estimated_count: number;
  /** How many are on a season value nobody has ruled on. */
  unresolved_count: number;
}

/** A saved filter preset: a team's named locks + exclusions. Same shape as the
 *  URL query params, so loading one just writes those params back. */
export interface LineupFilterPreset {
  id: number;
  name: string;
  constraints: {
    /** line code -> the two locked player keys */
    locks: Record<string, string[]>;
    excluded: string[];
  };
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LineupConstraints {
  /** Line code to the two player keys standing on it. */
  locks?: Record<string, [string, string]>;
  /** Line code to one pinned player key; the engine chooses the partner. */
  pins?: Record<string, string>;
  excluded?: string[];
}

/**
 * One team's lineup search, or null when the season, division or team is
 * unknown.
 *
 * null and a result with no candidates are different answers: the first means
 * the URL names nothing, the second that nothing legal could be built.
 */
export async function getTeamLineups(
  year: number | string,
  code: string,
  teamCode: string,
  constraints: LineupConstraints = {},
): Promise<LineupSearch | null> {
  const params = new URLSearchParams();
  for (const [line, pair] of Object.entries(constraints.locks ?? {})) {
    params.append("lock", `${line}:${pair[0]},${pair[1]}`);
  }
  for (const [line, key] of Object.entries(constraints.pins ?? {})) {
    params.append("pin", `${line}:${key}`);
  }
  for (const key of constraints.excluded ?? []) params.append("exclude", key);
  const query = params.toString();

  const res = await fetch(
    backendUrl(
      `/api/seasons/${year}/divisions/${code}/teams/` +
        `${encodeURIComponent(teamCode)}/lineups${query ? `?${query}` : ""}`,
    ),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getTeamLineups failed: ${res.status}`);
  return res.json();
}

/** A team's saved filter presets. Read-only; empty list for an unknown team is
 *  not distinguished from a team with none — neither is a lineup answer.
 *
 *  Degrades to an empty list on ANY failure rather than throwing: presets are
 *  an enhancement bolted onto the lineup page, and their store may not exist
 *  yet (the migration is applied to the shared database by hand, after deploy).
 *  A missing or erroring preset store must not take the whole lineup page down
 *  with it — the search is the thing that matters. */
export async function getTeamPresets(
  year: number | string,
  code: string,
  teamCode: string,
): Promise<LineupFilterPreset[]> {
  try {
    const res = await fetch(
      backendUrl(
        `/api/seasons/${year}/divisions/${code}/teams/` +
          `${encodeURIComponent(teamCode)}/presets`,
      ),
      backendRequestInit(),
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** One saved lineup, re-judged by the backend against the CURRENT
 *  participation UTRs. `status` is the backend's verdict — the front end never
 *  re-derives legality from the snapshot. */
export interface SavedLineup {
  id: number;
  name: string;
  /** line code -> the two player keys standing on it. */
  assignment: Record<string, string[]>;
  /** player key -> the participation UTR string captured at save time. Read
   *  only: it is what moved *from*, never written back to a player. */
  utr_snapshot: Record<string, string>;
  /** The backend's verdict, the one field the UI colours and branches on. A
   *  literal union, not a bare string: a value the backend adds later must
   *  fail a type check here rather than fall through to "legal" on screen. */
  status: "valid" | "utr_moved" | "illegal" | "player_gone";
  /** Set when status is "illegal": which rule the current UTRs now break. */
  violations: LineupViolation[];
  /** player key -> {name, snapshot, current}: only the players whose UTR
   *  changed since save. Names who moved and by how much. */
  utr_diff: Record<string, { name: string; snapshot: string; current: string }>;
  /** player keys no longer on the roster; non-empty only for "player_gone". */
  missing: string[];
}

/** A team's saved lineups, each re-judged against current UTRs by the backend.
 *
 *  Degrades to an empty list on ANY failure, exactly like getTeamPresets: the
 *  saved-lineup store is applied to the shared database by hand after deploy,
 *  so a missing table must not take the page down. */
export async function getSavedLineups(
  year: number | string,
  code: string,
  teamCode: string,
): Promise<SavedLineup[]> {
  try {
    const res = await fetch(
      backendUrl(
        `/api/seasons/${year}/divisions/${code}/teams/` +
          `${encodeURIComponent(teamCode)}/saved-lineups`,
      ),
      backendRequestInit(),
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface PlayerSeasonUtr {
  season_year: number;
  /** What gets read. While a conflict is unresolved this is the LARGER of the
   *  two candidates — participation UTR is an upper bound, so reading low
   *  would call an illegal lineup legal. */
  value: string;
  /** The other candidate, kept rather than dropped. null when there is none. */
  alt_value: string | null;
  is_unresolved: boolean;
  /** Which sheet each candidate came from, where that is known. null for a
   *  conflict produced by merging two hand-made records. Never inferred from
   *  size — the larger candidate is gold for some players and silver for
   *  others, so labelling the columns by value would state the opposite of the
   *  truth for half of them. */
  value_division: string | null;
  alt_value_division: string | null;
  /** null means nobody has decided yet — an Unrated sheet row could be
   *  committee-adjudicated or captain-rated depending on match history the
   *  sheet does not carry. */
  status: string | null;
  under_appeal: boolean;
  /** 'prefilled' is a guess copied from the current UTR; without this it and a
   *  frozen official value look identical. */
  source: string;
}

export interface PlayerMembership {
  id: number;
  team_id: number;
  team_code: string;
  season_year: number;
  division_code: string;
  /** Free text; there is no school table to resolve it against. */
  representing_school: string | null;
  /** null means unmarked — NOT "confirmed not a borrowed player". The rules cap
   *  borrowed players per match and this system never checks that, so the
   *  distinction is the difference between vetted and merely looked at. */
  is_borrowed_player: boolean | null;
  /** A different thing from borrowed: not from the current school, needs
   *  committee approval, does not affect eligibility. */
  is_wildcard: boolean | null;
}

export interface Player {
  id: number;
  last_name: string;
  first_name: string;
  gender: string | null;
  singles_utr: string | null;
  singles_status: string | null;
  doubles_utr: string | null;
  doubles_status: string | null;
  /** The only evidence two records are the same human. Empty asserts nothing. */
  utr_profile_id: string | null;
  season_utrs: PlayerSeasonUtr[];
  memberships: PlayerMembership[];
}

export interface PlayerFilters {
  query?: string;
  season?: number | string;
  teamId?: number | string;
}

/** Players, with their season values and every team they belong to. */
export async function getPlayers(filters: PlayerFilters = {}): Promise<Player[]> {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.season !== undefined) params.set("season", String(filters.season));
  if (filters.teamId !== undefined) params.set("team_id", String(filters.teamId));
  const query = params.toString();

  const res = await fetch(
    backendUrl(`/api/players${query ? `?${query}` : ""}`),
    backendRequestInit(),
  );
  // No empty-list fallback: that would say "there are no players", which is a
  // claim about the roster rather than about the request.
  if (!res.ok) throw new Error(`getPlayers failed: ${res.status}`);
  return res.json();
}

/** One player, or null when there is no such id. */
export async function getPlayer(id: number | string): Promise<Player | null> {
  const res = await fetch(
    backendUrl(`/api/players/${encodeURIComponent(String(id))}`),
    backendRequestInit(),
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPlayer failed: ${res.status}`);
  return res.json();
}

export interface PlayerPage {
  players: Player[];
  /** How many match in total, regardless of how many this page holds. */
  total: number;
  /** True when the server had more than it returned. Shown rather than
   *  swallowed: a list that quietly stops at 200 of 375 reads as "there are
   *  200", which is a different and false statement. */
  truncated: boolean;
}

export interface PlayerPageFilters extends PlayerFilters {
  /** Only players whose participation UTR is contested for some season. */
  unresolved?: boolean;
  limit?: number;
}

/** Players plus the honest total, for anywhere that shows a count. */
export async function getPlayersPage(
  filters: PlayerPageFilters = {},
): Promise<PlayerPage> {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.season !== undefined) params.set("season", String(filters.season));
  if (filters.teamId !== undefined) params.set("team_id", String(filters.teamId));
  if (filters.unresolved) params.set("unresolved", "true");
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();

  const res = await fetch(
    backendUrl(`/api/players${query ? `?${query}` : ""}`),
    backendRequestInit(),
  );
  if (!res.ok) throw new Error(`getPlayers failed: ${res.status}`);

  const players: Player[] = await res.json();
  // Falls back to the page size only when the header is absent — then the two
  // are equal and nothing claims to know better than it does.
  const total = Number(res.headers?.get("X-Total-Count") ?? players.length);

  return { players, total, truncated: total > players.length };
}
