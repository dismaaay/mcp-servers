/**
 * Core NASA API client.
 *
 * This module deliberately contains NO Model Context Protocol imports so that
 * the HTTP/data logic can be unit-tested and reused independently of the MCP
 * transport. It relies only on Node's global `fetch` (Node >= 18).
 */

const BASE_URL = "https://api.nasa.gov";
const DEFAULT_TIMEOUT_MS = Number(process.env.NASA_TIMEOUT_MS) || 10_000;

/**
 * The NASA API key. NASA publishes a shared `DEMO_KEY` that works without any
 * signup (rate-limited to ~30 req/hr per IP). Users can supply their own key
 * via the NASA_API_KEY environment variable for higher limits.
 */
const API_KEY = process.env.NASA_API_KEY?.trim() || "DEMO_KEY";

/** Descriptive User-Agent so NASA can identify this client (good API citizen). */
const USER_AGENT =
  "mcp-nasa/1.0.0 (+https://github.com/mcp-catalog/mcp-nasa; Model Context Protocol server)";

/** A date in YYYY-MM-DD form. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class NasaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "NasaApiError";
  }
}

/** Validate that a string looks like a YYYY-MM-DD date. Throws otherwise. */
export function assertValidDate(date: string): void {
  if (!DATE_RE.test(date)) {
    throw new NasaApiError(
      `Invalid date "${date}". Expected format YYYY-MM-DD (e.g. 2026-06-17).`,
    );
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new NasaApiError(`Invalid calendar date "${date}".`);
  }
}

/**
 * Perform a GET request against the NASA API with a hard timeout, automatic
 * api_key injection, a descriptive User-Agent, and helpful error messages.
 */
async function nasaGet(
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("api_key", API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new NasaApiError(
        `NASA API request timed out after ${DEFAULT_TIMEOUT_MS}ms (${url.pathname}).`,
      );
    }
    throw new NasaApiError(
      `Network error calling NASA API (${url.pathname}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.text();

  if (!res.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail =
        parsed?.error?.message ??
        parsed?.msg ??
        parsed?.error_message ??
        body;
    } catch {
      /* keep raw body */
    }
    if (res.status === 429) {
      throw new NasaApiError(
        "NASA API rate limit exceeded. The shared DEMO_KEY is limited; set NASA_API_KEY to your own free key from https://api.nasa.gov.",
        429,
      );
    }
    throw new NasaApiError(
      `NASA API returned HTTP ${res.status}: ${String(detail).slice(0, 300)}`,
      res.status,
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new NasaApiError(
      `NASA API returned a non-JSON response: ${body.slice(0, 200)}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* APOD — Astronomy Picture of the Day                                        */
/* -------------------------------------------------------------------------- */

export interface Apod {
  date: string;
  title: string;
  explanation: string;
  media_type: string;
  url?: string;
  hdurl?: string;
  copyright?: string;
  service_version?: string;
}

/**
 * Fetch the Astronomy Picture of the Day. If `date` is omitted, NASA returns
 * today's picture.
 */
export async function getApod(date?: string): Promise<Apod> {
  const params: Record<string, string> = {};
  if (date) {
    assertValidDate(date);
    params.date = date;
  }
  return (await nasaGet("/planetary/apod", params)) as Apod;
}

/* -------------------------------------------------------------------------- */
/* NeoWs — Near Earth Object Web Service                                      */
/* -------------------------------------------------------------------------- */

export interface NearEarthObject {
  id: string;
  name: string;
  nasa_jpl_url: string;
  absolute_magnitude_h: number;
  is_potentially_hazardous_asteroid: boolean;
  is_sentry_object: boolean;
  estimated_diameter: {
    meters: { estimated_diameter_min: number; estimated_diameter_max: number };
    kilometers: {
      estimated_diameter_min: number;
      estimated_diameter_max: number;
    };
  };
  close_approach_data: Array<{
    close_approach_date: string;
    close_approach_date_full: string;
    relative_velocity: { kilometers_per_hour: string };
    miss_distance: { kilometers: string; lunar: string };
    orbiting_body: string;
  }>;
}

export interface NeoFeed {
  element_count: number;
  near_earth_objects: Record<string, NearEarthObject[]>;
}

/**
 * Fetch near-earth objects (asteroids) whose closest approach falls on the
 * given date. If `date` is omitted, today's UTC date is used. NASA's feed
 * endpoint accepts a date range; we query a single day for clarity.
 */
export async function getNearEarthObjects(date?: string): Promise<NeoFeed> {
  const day = date ?? new Date().toISOString().slice(0, 10);
  assertValidDate(day);
  return (await nasaGet("/neo/rest/v1/feed", {
    start_date: day,
    end_date: day,
  })) as NeoFeed;
}

/** Flatten a NeoWs feed into a simple, sorted list of objects for one day. */
export function flattenNeoFeed(feed: NeoFeed): {
  date: string;
  count: number;
  objects: NearEarthObject[];
} {
  const dates = Object.keys(feed.near_earth_objects ?? {});
  const date = dates[0] ?? "";
  const objects = (feed.near_earth_objects?.[date] ?? []).slice();
  // Sort by closest miss distance (km) ascending — nearest first.
  objects.sort((a, b) => {
    const am = Number(a.close_approach_data?.[0]?.miss_distance?.kilometers ?? Infinity);
    const bm = Number(b.close_approach_data?.[0]?.miss_distance?.kilometers ?? Infinity);
    return am - bm;
  });
  return { date, count: feed.element_count ?? objects.length, objects };
}
