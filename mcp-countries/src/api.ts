/**
 * Core REST Countries data access. No MCP imports here so this module is
 * independently unit-testable.
 *
 * Data source note
 * ----------------
 * The classic `https://restcountries.com/v3.1` endpoints were deprecated and
 * removed; the successor (v5 at api.restcountries.com) now requires an API key
 * and returns only a canned demo object without one. To keep this server
 * key-free and genuinely live, we read the SAME canonical upstream dataset that
 * REST Countries was itself built from: the public `mledoze/countries` project.
 * It exposes the identical v3.1-style shape (name.common, cca3, capital,
 * region, borders, currencies, languages, flags...) over a real, free HTTP GET.
 *
 * We fetch the full dataset once and cache it in-process, which also lets us
 * resolve border alpha-3 codes to human-readable country names locally.
 */

const DATA_URL =
  "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json";

const DEFAULT_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Currency entry as stored in the dataset. */
export interface Currency {
  name?: string;
  symbol?: string;
}

/** A single country record (subset of fields we care about). */
export interface Country {
  name: {
    common: string;
    official: string;
    native?: Record<string, { official: string; common: string }>;
  };
  cca2?: string;
  cca3?: string;
  capital?: string[];
  region?: string;
  subregion?: string;
  area?: number;
  population?: number;
  borders?: string[];
  currencies?: Record<string, Currency>;
  languages?: Record<string, string>;
  tld?: string[];
  latlng?: number[];
  flag?: string; // emoji
  callingCodes?: string[];
  landlocked?: boolean;
  unMember?: boolean;
}

/** Raised for any operational failure (network, timeout, not found). */
export class CountryApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CountryApiError";
  }
}

interface Cache {
  fetchedAt: number;
  countries: Country[];
}

let cache: Cache | null = null;

/** Perform a fetch with an AbortController-based timeout. */
async function fetchWithTimeout(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-countries/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new CountryApiError(
        `Request to the countries dataset timed out after ${timeoutMs}ms`,
      );
    }
    throw new CountryApiError(
      `Network error fetching countries dataset: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the full countries dataset (cached). Exposed so callers/tests can warm
 * or inspect the cache, but most consumers should use the helpers below.
 */
export async function loadCountries(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Country[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.countries;
  }

  const res = await fetchWithTimeout(DATA_URL, timeoutMs);
  if (!res.ok) {
    throw new CountryApiError(
      `Countries dataset returned HTTP ${res.status} ${res.statusText}`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new CountryApiError(
      `Failed to parse countries dataset JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!Array.isArray(json) || json.length === 0) {
    throw new CountryApiError("Countries dataset was empty or malformed");
  }

  cache = { fetchedAt: Date.now(), countries: json as Country[] };
  return cache.countries;
}

/** Build an alpha-3 -> common name lookup for border resolution. */
function buildCodeIndex(countries: Country[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of countries) {
    if (c.cca3) idx.set(c.cca3.toUpperCase(), c.name.common);
  }
  return idx;
}

/**
 * Find the single best matching country for a free-text name/code query.
 * Matching order: exact alpha-2/alpha-3 code, exact common/official name,
 * then case-insensitive substring on common/official/native names.
 */
export async function getCountry(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Country> {
  const matches = await searchCountries(query, timeoutMs);
  if (matches.length === 0) {
    throw new CountryApiError(`No country found matching "${query}"`);
  }
  return matches[0];
}

/** Return all countries matching a name/code query, best match first. */
export async function searchCountries(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Country[]> {
  const q = query.trim().toLowerCase();
  if (!q) throw new CountryApiError("Query must not be empty");

  const countries = await loadCountries(timeoutMs);

  // 1. Exact alpha-2 / alpha-3 code.
  const codeHits = countries.filter(
    (c) =>
      c.cca2?.toLowerCase() === q || c.cca3?.toLowerCase() === q,
  );
  if (codeHits.length) return codeHits;

  // 2. Exact common / official name.
  const exactName = countries.filter(
    (c) =>
      c.name.common.toLowerCase() === q ||
      c.name.official.toLowerCase() === q,
  );
  if (exactName.length) return exactName;

  // 3. Substring on common / official / native names.
  const partial = countries.filter((c) => {
    if (c.name.common.toLowerCase().includes(q)) return true;
    if (c.name.official.toLowerCase().includes(q)) return true;
    if (c.name.native) {
      for (const n of Object.values(c.name.native)) {
        if (
          n.common.toLowerCase().includes(q) ||
          n.official.toLowerCase().includes(q)
        ) {
          return true;
        }
      }
    }
    return false;
  });

  // Prefer shorter common names (closer matches) first.
  return partial.sort(
    (a, b) => a.name.common.length - b.name.common.length,
  );
}

/** Return all countries in a region (case-insensitive). */
export async function listByRegion(
  region: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Country[]> {
  const r = region.trim().toLowerCase();
  if (!r) throw new CountryApiError("Region must not be empty");

  const countries = await loadCountries(timeoutMs);
  const hits = countries.filter(
    (c) =>
      c.region?.toLowerCase() === r || c.subregion?.toLowerCase() === r,
  );
  if (hits.length === 0) {
    const valid = [...new Set(countries.map((c) => c.region).filter(Boolean))]
      .sort()
      .join(", ");
    throw new CountryApiError(
      `No countries found for region "${region}". Valid regions: ${valid}.`,
    );
  }
  return hits.sort((a, b) => a.name.common.localeCompare(b.name.common));
}

export interface BorderResult {
  country: Country;
  /** Bordering countries, resolved from alpha-3 codes to records. */
  borders: { code: string; name: string }[];
}

/** Resolve the land borders of the country matching `query` to names. */
export async function getBorders(
  query: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BorderResult> {
  const countries = await loadCountries(timeoutMs);
  const country = await getCountry(query, timeoutMs);
  const idx = buildCodeIndex(countries);

  const borders = (country.borders ?? []).map((code) => ({
    code,
    name: idx.get(code.toUpperCase()) ?? code,
  }));

  return { country, borders };
}

/** For tests: drop the in-process cache. */
export function _resetCache(): void {
  cache = null;
}
