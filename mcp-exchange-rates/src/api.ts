/**
 * Core Frankfurter API client.
 *
 * This module is intentionally free of any MCP imports so it can be unit-tested
 * and reused independently of the protocol layer.
 *
 * Frankfurter is a free, no-key foreign-exchange API backed by European Central
 * Bank reference rates. Canonical host: https://api.frankfurter.dev/v1
 * (the legacy api.frankfurter.app host 301-redirects here).
 */

const API_BASE = "https://api.frankfurter.dev/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Shape returned by the Frankfurter /latest, /<date> and conversion endpoints. */
export interface FrankfurterRatesResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/** A three-letter ISO 4217 currency code, normalized to upper case. */
export function normalizeCurrency(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(trimmed)) {
    throw new Error(
      `Invalid currency code "${code}". Expected a 3-letter ISO 4217 code (e.g. USD, EUR, GBP).`,
    );
  }
  return trimmed;
}

/** Validate an ISO date string (YYYY-MM-DD) and that it is a real calendar date. */
export function normalizeDate(date: string): string {
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid date "${date}". Expected format YYYY-MM-DD (e.g. 2024-01-02).`);
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`Invalid calendar date "${date}".`);
  }
  if (parsed.getTime() > Date.now()) {
    throw new Error(`Date "${date}" is in the future; historical rates are not available yet.`);
  }
  return trimmed;
}

/**
 * Low-level GET against the Frankfurter API with a hard timeout and clear,
 * actionable error messages. Returns parsed JSON of type T.
 */
async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-exchange-rates/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request to Frankfurter API timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Network error contacting Frankfurter API: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();

  if (!res.ok) {
    // Frankfurter returns {"message":"not found"} for unknown currencies/dates.
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) detail = parsed.message;
    } catch {
      /* keep raw text */
    }
    throw new Error(`Frankfurter API error (HTTP ${res.status}): ${detail}`);
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(`Frankfurter API returned non-JSON response: ${text.slice(0, 200)}`);
  }
  return data;
}

/**
 * Convert an amount from one currency to another using the latest rates.
 */
export async function convert(
  amount: number,
  from: string,
  to: string,
): Promise<{ amount: number; from: string; to: string; rate: number; result: number; date: string }> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount "${amount}". Expected a non-negative number.`);
  }
  const fromCode = normalizeCurrency(from);
  const toCode = normalizeCurrency(to);

  if (fromCode === toCode) {
    const today = new Date().toISOString().slice(0, 10);
    return { amount, from: fromCode, to: toCode, rate: 1, result: amount, date: today };
  }

  const data = await getJson<FrankfurterRatesResponse>("/latest", {
    amount: String(amount),
    base: fromCode,
    symbols: toCode,
  });

  const result = data.rates[toCode];
  if (result === undefined) {
    throw new Error(`No rate returned for ${fromCode}->${toCode}. Check the currency codes.`);
  }
  const rate = amount === 0 ? 0 : result / amount;
  return { amount, from: fromCode, to: toCode, rate, result, date: data.date };
}

/**
 * Get the latest rates for a base currency (default EUR) against all
 * supported currencies.
 */
export async function latest(base?: string): Promise<FrankfurterRatesResponse> {
  const params: Record<string, string> = {};
  if (base && base.trim()) params.base = normalizeCurrency(base);
  return getJson<FrankfurterRatesResponse>("/latest", params);
}

/**
 * Get a historical rate for a given date.
 *
 * @param from   source currency (base for the lookup)
 * @param to     target currency to report
 * @param date   ISO date YYYY-MM-DD
 * @param base   optional alias for `from`; if provided it overrides `from`
 */
export async function history(
  from: string,
  to: string,
  date: string,
  base?: string,
): Promise<{ from: string; to: string; date: string; rate: number; actualDate: string }> {
  const fromCode = normalizeCurrency(base && base.trim() ? base : from);
  const toCode = normalizeCurrency(to);
  const isoDate = normalizeDate(date);

  if (fromCode === toCode) {
    return { from: fromCode, to: toCode, date: isoDate, rate: 1, actualDate: isoDate };
  }

  const data = await getJson<FrankfurterRatesResponse>(`/${isoDate}`, {
    base: fromCode,
    symbols: toCode,
  });

  const rate = data.rates[toCode];
  if (rate === undefined) {
    throw new Error(`No historical rate for ${fromCode}->${toCode} on ${isoDate}.`);
  }
  // Frankfurter snaps weekends/holidays to the most recent business day; report it.
  return { from: fromCode, to: toCode, date: isoDate, rate, actualDate: data.date };
}
