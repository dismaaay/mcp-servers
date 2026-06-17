/**
 * Core SpaceX API client.
 *
 * Pure data-access layer with NO Model Context Protocol imports so it can be
 * unit-tested or reused independently of the MCP transport.
 *
 * Wraps the public r-spacex SpaceX-API (https://github.com/r-spacex/SpaceX-API).
 * No API key is required.
 */

const BASE_URL = "https://api.spacexdata.com";
const USER_AGENT =
  "mcp-spacex/1.0 (+https://github.com/mcp-catalog/mcp-spacex; Model Context Protocol server)";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Raw shape of a launch from the SpaceX v5 launches API (subset we use). */
export interface SpaceXLaunch {
  id: string;
  name: string;
  flight_number: number;
  date_utc: string;
  date_unix: number;
  success: boolean | null;
  upcoming: boolean;
  details: string | null;
  rocket: string | null;
  launchpad: string | null;
  links?: {
    webcast?: string | null;
    article?: string | null;
    wikipedia?: string | null;
    patch?: { small?: string | null; large?: string | null } | null;
  };
}

/** Raw shape of a rocket from the SpaceX v4 rockets API (subset we use). */
export interface SpaceXRocket {
  id: string;
  name: string;
  type: string;
  active: boolean;
  stages: number;
  boosters: number;
  cost_per_launch: number | null;
  success_rate_pct: number | null;
  first_flight: string | null;
  country: string | null;
  company: string | null;
  height?: { meters?: number | null; feet?: number | null };
  diameter?: { meters?: number | null; feet?: number | null };
  mass?: { kg?: number | null; lb?: number | null };
  description: string | null;
}

/** Error thrown for any non-OK upstream response or network failure. */
export class SpaceXApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SpaceXApiError";
  }
}

/**
 * Perform a GET against the SpaceX API with a hard timeout and descriptive
 * User-Agent. Returns parsed JSON of type T.
 */
async function spacexGet<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `request timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new SpaceXApiError(`SpaceX API request to ${path} failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new SpaceXApiError(
      `SpaceX API returned HTTP ${res.status} for ${path}`,
      res.status,
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new SpaceXApiError(`SpaceX API returned invalid JSON for ${path}`);
  }
}

/** POST a query to a v4/v5 "/query" endpoint (uses mongoose-style options). */
async function spacexQuery<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `request timed out after ${DEFAULT_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new SpaceXApiError(`SpaceX API query to ${path} failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new SpaceXApiError(
      `SpaceX API returned HTTP ${res.status} for ${path}`,
      res.status,
    );
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new SpaceXApiError(`SpaceX API returned invalid JSON for ${path}`);
  }
}

/** Most recent past launch. */
export function getLatestLaunch(): Promise<SpaceXLaunch> {
  return spacexGet<SpaceXLaunch>("/v5/launches/latest");
}

/** Next upcoming launch. */
export function getNextLaunch(): Promise<SpaceXLaunch> {
  return spacexGet<SpaceXLaunch>("/v5/launches/next");
}

/** All rockets (used to resolve a rocket by name). */
export function getAllRockets(): Promise<SpaceXRocket[]> {
  return spacexGet<SpaceXRocket[]>("/v4/rockets");
}

/** A single rocket by its API id. */
export function getRocketById(id: string): Promise<SpaceXRocket> {
  return spacexGet<SpaceXRocket>(`/v4/rockets/${encodeURIComponent(id)}`);
}

/**
 * Resolve a rocket by SpaceX id OR by (case-insensitive) name such as
 * "Falcon 9", "falcon heavy", "starship".
 */
export async function getRocket(nameOrId: string): Promise<SpaceXRocket> {
  const query = nameOrId.trim();
  if (!query) {
    throw new SpaceXApiError("Rocket name or id must not be empty");
  }

  // SpaceX ids are 24-char hex ObjectIds. Try a direct id lookup first.
  if (/^[a-f0-9]{24}$/i.test(query)) {
    try {
      return await getRocketById(query);
    } catch (err) {
      if (err instanceof SpaceXApiError && err.status === 404) {
        // fall through to name search
      } else {
        throw err;
      }
    }
  }

  const rockets = await getAllRockets();
  const wanted = query.toLowerCase();

  const exact = rockets.find((r) => r.name.toLowerCase() === wanted);
  if (exact) return exact;

  const partial = rockets.find((r) => r.name.toLowerCase().includes(wanted));
  if (partial) return partial;

  const names = rockets.map((r) => r.name).join(", ");
  throw new SpaceXApiError(
    `No rocket matching "${nameOrId}". Available rockets: ${names}`,
  );
}

/**
 * The N most recent past launches (newest first).
 * Uses the /query endpoint with sort + limit for an efficient single request.
 */
export async function getRecentLaunches(limit: number): Promise<SpaceXLaunch[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const result = await spacexQuery<{ docs: SpaceXLaunch[] }>(
    "/v5/launches/query",
    {
      query: { upcoming: false },
      options: {
        sort: { date_unix: "desc" },
        limit: safeLimit,
        pagination: false,
      },
    },
  );
  return result.docs ?? [];
}

/** Build a stable rocket-name lookup map: id -> name. */
export async function getRocketNameMap(): Promise<Map<string, string>> {
  const rockets = await getAllRockets();
  return new Map(rockets.map((r) => [r.id, r.name]));
}
