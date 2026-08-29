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
  last_name: string;
  first_name: string;
  gender: string | null;
  /** The participation UTR: frozen before the event, and the only number a
   *  lineup is checked against. */
  match_utr: string;
  /** The committee sheet's own status word, "/ Appeal" suffix included. */
  dutr_status: string;
  /** null when the status does not determine it (Unrated). Not a default:
   *  whether such a player is committee-adjudicated or self-rated depends on
   *  USTA match history the sheet does not carry. */
  rating_class: string | null;
  source_note: string | null;
  daily_utrs: string[];
  /** null means nobody has marked this player — not "confirmed not one". */
  is_borrowed_player: boolean | null;
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
  /** Where each unavailable player is: a line code, or "excluded". Read off
   *  the request — never a claim about which lock caused the dead end. */
  placements: Record<string, string>;
  truncated: boolean;
  /** Always false. The per-match borrowed-player ceiling depends on how many
   *  schools a team combines, which the system does not know. */
  borrowed_players_checked: boolean;
  invalid_locks: LineupViolation[];
  roster: LineupPlayer[];
}

export interface LineupConstraints {
  /** Line code to the two player keys standing on it. */
  locks?: Record<string, [string, string]>;
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
