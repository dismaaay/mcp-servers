/**
 * Core API logic for the ISS Tracker.
 *
 * This module is intentionally free of any MCP imports so it can be unit
 * tested and reused independently of the Model Context Protocol transport.
 *
 * Data sources (both free, no API key required):
 *   - wheretheiss.at : real-time ISS position / velocity / altitude
 *   - Open Notify    : list of people currently in space
 */

const ISS_NORAD_ID = 25544; // International Space Station catalog number
const WHERETHEISS_URL = `https://api.wheretheiss.at/v1/satellites/${ISS_NORAD_ID}`;
const OPEN_NOTIFY_ASTROS_URL = "http://api.open-notify.org/astros.json";

const USER_AGENT =
  "mcp-iss-tracker/1.0.0 (+https://github.com/mcp-catalog/mcp-iss-tracker)";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Shape returned by wheretheiss.at for a satellite. */
export interface IssPosition {
  /** NORAD catalog id (25544 for the ISS). */
  id: number;
  /** Latitude in decimal degrees (-90..90). */
  latitude: number;
  /** Longitude in decimal degrees (-180..180). */
  longitude: number;
  /** Altitude above sea level in kilometers. */
  altitudeKm: number;
  /** Orbital velocity in km/h. */
  velocityKmh: number;
  /** "daylight" or "eclipsed" — whether the ISS is currently sunlit. */
  visibility: string;
  /** Diameter of the visible ground footprint in km. */
  footprintKm: number;
  /** Unix timestamp (seconds) the reading is valid for. */
  timestamp: number;
  /** ISO-8601 form of `timestamp` for convenience. */
  timestampIso: string;
}

/** A single human currently off the planet. */
export interface PersonInSpace {
  name: string;
  craft: string;
}

/** Result of {@link getPeopleInSpace}. */
export interface PeopleInSpace {
  number: number;
  people: PersonInSpace[];
  /** Map of craft name -> count, derived for convenience. */
  byCraft: Record<string, number>;
}

/**
 * Perform a JSON fetch with a hard timeout and a descriptive User-Agent.
 * Throws a readable Error on network failure, timeout, or non-2xx response.
 */
async function fetchJson<T>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Request to ${url} failed: HTTP ${res.status} ${res.statusText}`
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    if (err instanceof Error) {
      throw new Error(`Request to ${url} failed: ${err.message}`);
    }
    throw new Error(`Request to ${url} failed: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

interface WhereTheIssRaw {
  id: number;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: string;
  footprint: number;
  timestamp: number;
}

/** Fetch the live position of the International Space Station. */
export async function getIssPosition(
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<IssPosition> {
  const raw = await fetchJson<WhereTheIssRaw>(WHERETHEISS_URL, timeoutMs);
  if (typeof raw.latitude !== "number" || typeof raw.longitude !== "number") {
    throw new Error(
      `Unexpected response from wheretheiss.at: ${JSON.stringify(raw)}`
    );
  }
  return {
    id: raw.id,
    latitude: raw.latitude,
    longitude: raw.longitude,
    altitudeKm: raw.altitude,
    velocityKmh: raw.velocity,
    visibility: raw.visibility,
    footprintKm: raw.footprint,
    timestamp: raw.timestamp,
    timestampIso: new Date(raw.timestamp * 1000).toISOString(),
  };
}

interface AstrosRaw {
  message: string;
  number: number;
  people: PersonInSpace[];
}

/** Fetch the list of people currently in space. */
export async function getPeopleInSpace(
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<PeopleInSpace> {
  const raw = await fetchJson<AstrosRaw>(OPEN_NOTIFY_ASTROS_URL, timeoutMs);
  if (raw.message !== "success" || !Array.isArray(raw.people)) {
    throw new Error(
      `Unexpected response from Open Notify: ${JSON.stringify(raw)}`
    );
  }
  const byCraft: Record<string, number> = {};
  for (const person of raw.people) {
    byCraft[person.craft] = (byCraft[person.craft] ?? 0) + 1;
  }
  return {
    number: raw.number,
    people: raw.people,
    byCraft,
  };
}
