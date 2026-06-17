/**
 * World Bank Indicators API client.
 *
 * Pure data-access layer with NO MCP imports. This module wraps the public
 * World Bank Indicators API (https://api.worldbank.org/v2), which requires no
 * API key. All network calls use the Node global `fetch` with a 10s timeout
 * and a descriptive User-Agent header.
 *
 * Docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
 */

const BASE_URL = "https://api.worldbank.org/v2";
const USER_AGENT =
  "mcp-worldbank/1.0.0 (+https://github.com/; World Bank Indicators MCP server; Node fetch)";
const TIMEOUT_MS = 10_000;

/** A single observation of an indicator for a country/year. */
export interface IndicatorObservation {
  indicatorId: string;
  indicatorName: string;
  country: string;
  countryId: string;
  countryIso3: string;
  date: string;
  value: number | null;
  unit: string;
}

/** Summary of an indicator definition. */
export interface IndicatorSummary {
  id: string;
  name: string;
  source: string;
  sourceNote: string;
  topics: string[];
}

/** Summary of a country / aggregate region. */
export interface CountrySummary {
  id: string;
  iso2Code: string;
  name: string;
  region: string;
  incomeLevel: string;
  capitalCity: string;
}

/** Error thrown when the World Bank API returns a problem or invalid input. */
export class WorldBankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldBankError";
  }
}

/**
 * Perform a GET against the World Bank API and return parsed JSON.
 * Adds format=json, a 10s timeout, and a descriptive User-Agent.
 */
async function wbFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new WorldBankError(`Request to World Bank API timed out after ${TIMEOUT_MS}ms`);
    }
    throw new WorldBankError(
      `Network error contacting World Bank API: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new WorldBankError(`World Bank API returned HTTP ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as unknown;

  // The World Bank API signals errors with a `{ message: [...] }` object
  // instead of the usual [metadata, data] tuple.
  if (!Array.isArray(json)) {
    if (json && typeof json === "object" && "message" in json) {
      const msgs = (json as { message?: Array<{ key?: string; value?: string }> }).message;
      const text = Array.isArray(msgs)
        ? msgs.map((m) => m.value ?? m.key ?? JSON.stringify(m)).join("; ")
        : JSON.stringify(json);
      throw new WorldBankError(`World Bank API error: ${text}`);
    }
    throw new WorldBankError(`Unexpected response shape from World Bank API`);
  }

  return json;
}

/** Validate an ISO2/ISO3 country code or "all". */
function normalizeCountry(country: string): string {
  const c = country.trim();
  if (!/^[A-Za-z]{2,3}$|^all$/i.test(c)) {
    throw new WorldBankError(
      `Invalid country code "${country}". Use a 2- or 3-letter ISO code (e.g. "US", "BRA") or "all".`,
    );
  }
  return c.toUpperCase();
}

/** Validate an indicator id (e.g. NY.GDP.MKTP.CD). */
function normalizeIndicator(indicator: string): string {
  const i = indicator.trim();
  if (!i || /[\s/?&#]/.test(i)) {
    throw new WorldBankError(
      `Invalid indicator id "${indicator}". Use a World Bank indicator code such as "NY.GDP.MKTP.CD".`,
    );
  }
  return i;
}

/**
 * get_indicator: fetch observations for a country + indicator.
 *
 * @param country   2/3-letter ISO code (e.g. "US", "BRA") or "all".
 * @param indicator World Bank indicator code (e.g. "NY.GDP.MKTP.CD").
 * @param years     Optional "YYYY" or "YYYY:YYYY" date range.
 */
export async function getIndicator(
  country: string,
  indicator: string,
  years?: string,
): Promise<{ indicatorName: string; observations: IndicatorObservation[] }> {
  const c = normalizeCountry(country);
  const ind = normalizeIndicator(indicator);

  const params: Record<string, string> = { per_page: "1000" };
  if (years && years.trim()) {
    const y = years.trim();
    if (!/^\d{4}(:\d{4})?$/.test(y)) {
      throw new WorldBankError(
        `Invalid years "${years}". Use a single year "2020" or a range "2010:2020".`,
      );
    }
    params.date = y;
  }

  const json = (await wbFetch(`/country/${c}/indicator/${ind}`, params)) as [
    Record<string, unknown>,
    Array<Record<string, any>> | null,
  ];

  const rows = json[1];
  if (!rows || rows.length === 0) {
    throw new WorldBankError(
      `No data found for indicator "${ind}" in country "${c}"${years ? ` for ${years}` : ""}. ` +
        `Check the codes with search_indicators / list_countries.`,
    );
  }

  const observations: IndicatorObservation[] = rows.map((r) => ({
    indicatorId: r.indicator?.id ?? ind,
    indicatorName: r.indicator?.value ?? "",
    country: r.country?.value ?? "",
    countryId: r.country?.id ?? "",
    countryIso3: r.countryiso3code ?? "",
    date: r.date ?? "",
    value: r.value === null || r.value === undefined ? null : Number(r.value),
    unit: r.unit ?? "",
  }));

  return {
    indicatorName: observations[0]?.indicatorName || ind,
    observations,
  };
}

/**
 * search_indicators: find indicators whose id or name matches a free-text query.
 *
 * The World Bank API has no free-text search endpoint, so we page through the
 * indicator catalog and filter client-side (case-insensitive substring match).
 *
 * @param query Free-text term, e.g. "gdp per capita" or "CO2".
 * @param limit Max results to return (default 25).
 */
export async function searchIndicators(query: string, limit = 25): Promise<IndicatorSummary[]> {
  const q = query.trim().toLowerCase();
  if (!q) {
    throw new WorldBankError(`Search query must not be empty.`);
  }
  const terms = q.split(/\s+/).filter(Boolean);

  // Page through the catalog. per_page max is 20000; 2 pages covers the full set.
  const matches: IndicatorSummary[] = [];
  const maxPages = 3;
  for (let page = 1; page <= maxPages; page++) {
    const json = (await wbFetch(`/indicator`, {
      per_page: "20000",
      page: String(page),
    })) as [{ pages?: number }, Array<Record<string, any>> | null];

    const meta = json[0] ?? {};
    const rows = json[1] ?? [];
    for (const r of rows) {
      const id = String(r.id ?? "");
      const name = String(r.name ?? "");
      const hay = `${id} ${name}`.toLowerCase();
      // All terms must appear (AND semantics) somewhere in id or name.
      if (terms.every((t) => hay.includes(t))) {
        matches.push({
          id,
          name,
          source: r.source?.value ?? "",
          sourceNote: String(r.sourceNote ?? "").slice(0, 300),
          topics: Array.isArray(r.topics)
            ? r.topics.map((t: any) => String(t.value ?? "").trim()).filter(Boolean)
            : [],
        });
        if (matches.length >= limit) return matches;
      }
    }
    if (meta.pages !== undefined && page >= meta.pages) break;
  }

  return matches;
}

/**
 * list_countries: list all countries and aggregate regions known to the API.
 */
export async function listCountries(): Promise<CountrySummary[]> {
  const json = (await wbFetch(`/country`, { per_page: "400" })) as [
    Record<string, unknown>,
    Array<Record<string, any>> | null,
  ];

  const rows = json[1] ?? [];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    iso2Code: String(r.iso2Code ?? ""),
    name: String(r.name ?? ""),
    region: r.region?.value?.trim() ?? "",
    incomeLevel: r.incomeLevel?.value?.trim() ?? "",
    capitalCity: String(r.capitalCity ?? ""),
  }));
}
