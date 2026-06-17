/**
 * Core data-access layer for the Nager.Date public-holiday API.
 *
 * This module intentionally has NO dependency on the MCP SDK so it can be
 * unit-tested and reused on its own. All logging goes to stderr; this module
 * never writes to stdout (stdout is reserved for the MCP protocol stream).
 */

const API_BASE = "https://date.nager.at/api/v3";
const DEFAULT_TIMEOUT_MS = 10_000;

/** A single public holiday as returned by Nager.Date. */
export interface Holiday {
  date: string; // ISO date, e.g. "2026-01-01"
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

/** A country supported by the API. */
export interface Country {
  countryCode: string;
  name: string;
}

/** Error thrown for any non-success or transport-level failure. */
export class HolidayApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HolidayApiError";
  }
}

/**
 * Perform a GET request against the API with a hard timeout and parse JSON.
 * Throws HolidayApiError with a human-readable message on any failure.
 */
async function getJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-public-holidays/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HolidayApiError(`Request to ${url} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new HolidayApiError(
      `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new HolidayApiError(
      "Unknown country code. Use a valid ISO 3166-1 alpha-2 code (e.g. US, GB, PL, DE).",
      404
    );
  }
  if (!res.ok) {
    throw new HolidayApiError(`API returned HTTP ${res.status} for ${url}`, res.status);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new HolidayApiError(
      `Failed to parse JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Validate & normalize a country code to the uppercase 2-letter form. */
export function normalizeCountryCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) {
    throw new HolidayApiError(
      `Invalid country code "${code}". Expected a 2-letter ISO 3166-1 alpha-2 code (e.g. US, GB, PL).`
    );
  }
  return c;
}

/** All public holidays for a given year and country. */
export function getHolidays(year: number, countryCode: string): Promise<Holiday[]> {
  const cc = normalizeCountryCode(countryCode);
  return getJson<Holiday[]>(`/PublicHolidays/${year}/${cc}`);
}

/** The list of upcoming public holidays for a country (next ~365 days). */
export function getNextHolidays(countryCode: string): Promise<Holiday[]> {
  const cc = normalizeCountryCode(countryCode);
  return getJson<Holiday[]>(`/NextPublicHolidays/${cc}`);
}

/** The list of supported countries. */
export function getAvailableCountries(): Promise<Country[]> {
  return getJson<Country[]>(`/AvailableCountries`);
}

/**
 * Determine whether a specific ISO date (YYYY-MM-DD) is a public holiday in a
 * country. Returns the matching Holiday if so, otherwise null.
 */
export async function checkIsHoliday(
  date: string,
  countryCode: string
): Promise<{ isHoliday: boolean; holiday: Holiday | null }> {
  const cc = normalizeCountryCode(countryCode);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) {
    throw new HolidayApiError(`Invalid date "${date}". Expected ISO format YYYY-MM-DD.`);
  }
  const year = Number(m[1]);
  const holidays = await getHolidays(year, cc);
  const holiday = holidays.find((h) => h.date === date.trim()) ?? null;
  return { isHoliday: holiday !== null, holiday };
}
