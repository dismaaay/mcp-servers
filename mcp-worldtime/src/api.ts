/**
 * Core API layer for mcp-worldtime.
 *
 * No MCP imports here — this module is a plain, testable HTTP client around
 * free, key-less world-time APIs.
 *
 * Primary source:  worldtimeapi.org  (https://worldtimeapi.org/api)
 * Fallback source: timeapi.io        (https://timeapi.io/api)
 *
 * worldtimeapi.org is the canonical service this server wraps, but it is
 * frequently unreachable (TLS resets / downtime). To keep the server genuinely
 * useful, every call transparently falls back to timeapi.io, which exposes the
 * same conceptual data (current time + IANA timezone list) without an API key.
 *
 * All logging goes to stderr only (stdout is reserved for the MCP stdio
 * transport).
 */

const WORLDTIME_BASE = "https://worldtimeapi.org/api";
const TIMEAPI_BASE = "https://timeapi.io/api";
const REQUEST_TIMEOUT_MS = 10_000;

/** Normalized current-time result returned by getTime(). */
export interface TimeResult {
  /** IANA timezone name, e.g. "Europe/Warsaw". */
  timezone: string;
  /** Full ISO-8601 datetime including offset when available. */
  datetime: string;
  /** UTC offset, e.g. "+02:00". May be empty if the source omits it. */
  utc_offset: string;
  /** Day of the week, e.g. "Wednesday". */
  day_of_week: string;
  /** Whether daylight saving time is currently active (best effort). */
  dst: boolean;
  /** Unix epoch seconds when known, otherwise null. */
  unixtime: number | null;
  /** Which upstream provided the data: "worldtimeapi.org" or "timeapi.io". */
  source: string;
}

/** Result returned by listTimezones(). */
export interface TimezoneListResult {
  /** Sorted list of IANA timezone names. */
  timezones: string[];
  /** Total count. */
  count: number;
  /** Which upstream provided the data. */
  source: string;
}

export class WorldTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldTimeError";
  }
}

/** Fetch JSON with a hard timeout and clear, actionable error messages. */
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-worldtime/1.0" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new WorldTimeError(
        `Request to ${url} failed with HTTP ${res.status} ${res.statusText}` +
          (body ? `: ${body.slice(0, 200)}` : "")
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof WorldTimeError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new WorldTimeError(
        `Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`
      );
    }
    throw new WorldTimeError(
      `Network error contacting ${url}: ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Run primary, and on ANY failure run the fallback. Logs to stderr. */
async function withFallback<T>(
  label: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    console.error(
      `[mcp-worldtime] ${label}: worldtimeapi.org failed (${(err as Error).message}); ` +
        `falling back to timeapi.io`
    );
    return await fallback();
  }
}

// ---------------------------------------------------------------------------
// get_time
// ---------------------------------------------------------------------------

function normalizeWorldtime(data: Record<string, unknown>): TimeResult {
  return {
    timezone: String(data.timezone ?? ""),
    datetime: String(data.datetime ?? ""),
    utc_offset: String(data.utc_offset ?? ""),
    day_of_week:
      typeof data.day_of_week === "number"
        ? weekdayName(data.day_of_week)
        : String(data.day_of_week ?? ""),
    dst: Boolean(data.dst),
    unixtime:
      typeof data.unixtime === "number" ? data.unixtime : null,
    source: "worldtimeapi.org",
  };
}

function normalizeTimeapi(
  data: Record<string, unknown>,
  timezone: string
): TimeResult {
  const dt = String(data.dateTime ?? "");
  return {
    timezone: String(data.timeZone ?? timezone),
    datetime: dt,
    utc_offset: "", // timeapi.io's /time/current/zone omits a clean offset
    day_of_week: String(data.dayOfWeek ?? ""),
    dst: Boolean(data.dstActive),
    unixtime: dt ? Math.floor(new Date(dt).getTime() / 1000) || null : null,
    source: "timeapi.io",
  };
}

function weekdayName(idx: number): string {
  // worldtimeapi day_of_week: 0 = Sunday .. 6 = Saturday
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return names[idx] ?? String(idx);
}

/**
 * Get the current time for an IANA timezone (e.g. "Europe/Warsaw", "Etc/UTC").
 */
export async function getTime(timezone: string): Promise<TimeResult> {
  const tz = timezone.trim();
  if (!tz) {
    throw new WorldTimeError(
      'Missing timezone. Provide an IANA name like "Europe/Warsaw" or "America/New_York".'
    );
  }

  return withFallback(
    `get_time(${tz})`,
    async () => {
      const data = (await fetchJson(
        `${WORLDTIME_BASE}/timezone/${encodeURI(tz)}`
      )) as Record<string, unknown>;
      if (data && (data as Record<string, unknown>).error) {
        throw new WorldTimeError(
          `worldtimeapi.org: ${String((data as Record<string, unknown>).error)}`
        );
      }
      return normalizeWorldtime(data);
    },
    async () => {
      const data = (await fetchJson(
        `${TIMEAPI_BASE}/time/current/zone?timeZone=${encodeURIComponent(tz)}`
      )) as Record<string, unknown>;
      if (!data || typeof data.dateTime !== "string") {
        throw new WorldTimeError(
          `Unknown or unsupported timezone "${tz}". Use list_timezones to see valid names.`
        );
      }
      return normalizeTimeapi(data, tz);
    }
  );
}

// ---------------------------------------------------------------------------
// list_timezones
// ---------------------------------------------------------------------------

/**
 * List supported IANA timezones, optionally filtered to a single area
 * (the part before the first "/", e.g. "Europe", "America", "Asia").
 */
export async function listTimezones(area?: string): Promise<TimezoneListResult> {
  const filter = area?.trim();

  const result = await withFallback<TimezoneListResult>(
    `list_timezones(${filter ?? "all"})`,
    async () => {
      // worldtimeapi supports /timezone and /timezone/:area directly.
      const path = filter
        ? `${WORLDTIME_BASE}/timezone/${encodeURIComponent(filter)}`
        : `${WORLDTIME_BASE}/timezone`;
      const data = await fetchJson(path);
      if (!Array.isArray(data)) {
        throw new WorldTimeError(
          `Unexpected response from worldtimeapi.org for "${path}"`
        );
      }
      const zones = (data as string[]).map(String);
      return {
        timezones: zones.sort(),
        count: zones.length,
        source: "worldtimeapi.org",
      };
    },
    async () => {
      // timeapi.io returns the full list; filter client-side by area prefix.
      const data = await fetchJson(`${TIMEAPI_BASE}/timezone/availabletimezones`);
      if (!Array.isArray(data)) {
        throw new WorldTimeError("Unexpected response from timeapi.io");
      }
      let zones = (data as string[]).map(String);
      if (filter) {
        const prefix = `${filter}/`;
        zones = zones.filter(
          (z) => z === filter || z.startsWith(prefix)
        );
      }
      return {
        timezones: zones.sort(),
        count: zones.length,
        source: "timeapi.io",
      };
    }
  );

  if (filter && result.count === 0) {
    throw new WorldTimeError(
      `No timezones found for area "${filter}". Try an area like "Europe", "America", "Asia", or "Africa".`
    );
  }
  return result;
}
