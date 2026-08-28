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
