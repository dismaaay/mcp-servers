/**
 * Core Coinbase public API client.
 *
 * This module deliberately contains NO MCP-specific imports so it can be unit
 * tested and reused independently of the protocol layer. It uses Node's global
 * `fetch` (Node >= 18) with a 10s timeout and logs only to stderr.
 */

const API_BASE = "https://api.coinbase.com/v2";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "mcp-coinbase-spot/1.0.0 (+https://github.com/mcp-catalog/mcp-coinbase-spot)";

/** Shape of a Coinbase spot price response (`/prices/{pair}/spot`). */
export interface SpotPrice {
  /** The price amount as a decimal string, e.g. "64862.625". */
  amount: string;
  /** Base asset, e.g. "BTC". */
  base: string;
  /** Quote/fiat currency, e.g. "USD". */
  currency: string;
}

/** Shape of a Coinbase exchange-rates response (`/exchange-rates`). */
export interface ExchangeRates {
  /** The base currency the rates are quoted against, e.g. "USD". */
  currency: string;
  /** Map of currency code -> rate (as decimal strings). */
  rates: Record<string, string>;
}

/** Error thrown for any non-OK upstream response or malformed payload. */
export class CoinbaseApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CoinbaseApiError";
  }
}

/**
 * Perform a GET request against the Coinbase v2 API with a hard timeout and a
 * descriptive User-Agent header (Coinbase rejects/penalizes anonymous clients).
 */
async function coinbaseGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
    if (err instanceof Error && err.name === "AbortError") {
      throw new CoinbaseApiError(
        `Request to Coinbase timed out after ${REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw new CoinbaseApiError(
      `Network error calling Coinbase: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await res.text();

  if (!res.ok) {
    // Coinbase returns { errors: [{ id, message }] } on failures.
    let detail = bodyText.slice(0, 300);
    try {
      const parsed = JSON.parse(bodyText) as {
        errors?: Array<{ message?: string }>;
      };
      if (parsed.errors?.length) {
        detail = parsed.errors.map((e) => e.message).join("; ");
      }
    } catch {
      // keep raw detail
    }
    throw new CoinbaseApiError(
      `Coinbase API error (HTTP ${res.status}): ${detail}`,
      res.status,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new CoinbaseApiError("Coinbase returned non-JSON response");
  }

  const data = (json as { data?: T }).data;
  if (data === undefined) {
    throw new CoinbaseApiError("Coinbase response missing 'data' field");
  }
  return data;
}

/**
 * Normalize a trading pair into Coinbase's `BASE-QUOTE` format.
 * Accepts "BTC", "btc-usd", "BTC/EUR", "eth_usd" etc.
 * A bare base asset defaults the quote to USD.
 */
export function normalizePair(pair: string): string {
  const cleaned = pair.trim().toUpperCase().replace(/[\s/_]+/g, "-");
  if (!cleaned) {
    throw new CoinbaseApiError("Pair must not be empty");
  }
  if (!cleaned.includes("-")) {
    return `${cleaned}-USD`;
  }
  return cleaned;
}

/**
 * Fetch the current spot price for a trading pair, e.g. "BTC-USD".
 * The spot price is the average price for the pair at the moment of the request.
 */
export async function getSpotPrice(pair: string): Promise<SpotPrice> {
  const normalized = normalizePair(pair);
  return coinbaseGet<SpotPrice>(
    `/prices/${encodeURIComponent(normalized)}/spot`,
  );
}

/**
 * Fetch exchange rates relative to a base currency (fiat or crypto), e.g. "USD".
 * Returns the full rate map keyed by currency code.
 */
export async function getExchangeRates(
  currency: string,
): Promise<ExchangeRates> {
  const cur = currency.trim().toUpperCase();
  if (!cur) {
    throw new CoinbaseApiError("Currency must not be empty");
  }
  return coinbaseGet<ExchangeRates>(
    `/exchange-rates?currency=${encodeURIComponent(cur)}`,
  );
}
