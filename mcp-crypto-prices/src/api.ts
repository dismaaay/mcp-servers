/**
 * Core CoinGecko API client.
 *
 * This module deliberately contains NO Model Context Protocol imports so that the
 * fetch / formatting logic can be unit-tested in isolation. All network calls go
 * through {@link cgFetch}, which enforces a request timeout and surfaces clear,
 * actionable error messages.
 */

const API_BASE = "https://api.coingecko.com/api/v3";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Raised when the upstream CoinGecko API cannot be reached or returns an error. */
export class CoinGeckoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoinGeckoError";
  }
}

/**
 * Perform a GET request against the CoinGecko API with a hard timeout.
 *
 * @param path  API path beginning with `/` (e.g. `/simple/price`).
 * @param params Query parameters; `undefined` values are skipped.
 */
async function cgFetch<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "mcp-crypto-prices/1.0" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new CoinGeckoError(`Request to CoinGecko timed out after ${timeoutMs}ms (${path}).`);
    }
    throw new CoinGeckoError(
      `Network error contacting CoinGecko (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new CoinGeckoError(
        "CoinGecko rate limit hit (HTTP 429). The free API is limited to ~10-30 requests/min — wait a moment and retry.",
      );
    }
    throw new CoinGeckoError(
      `CoinGecko returned HTTP ${res.status} for ${path}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Types describing the slices of CoinGecko responses we consume.
// ---------------------------------------------------------------------------

export interface SimplePriceEntry {
  [currency: string]: number;
}
export type SimplePriceResponse = Record<string, SimplePriceEntry>;

export interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number | null;
    data?: { price?: number; price_change_percentage_24h?: Record<string, number> };
  };
}
export interface TrendingResponse {
  coins: TrendingCoin[];
}

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
}

// ---------------------------------------------------------------------------
// Public API functions.
// ---------------------------------------------------------------------------

/**
 * Fetch spot prices (plus market cap and 24h change) for one or more coins.
 *
 * @param ids        CoinGecko coin ids, e.g. `["bitcoin", "ethereum"]`.
 * @param vsCurrency Quote currency, e.g. `"usd"`.
 */
export async function getPrice(ids: string[], vsCurrency: string): Promise<SimplePriceResponse> {
  const data = await cgFetch<SimplePriceResponse>("/simple/price", {
    ids: ids.join(","),
    vs_currencies: vsCurrency,
    include_market_cap: "true",
    include_24hr_change: "true",
    include_last_updated_at: "true",
  });
  return data;
}

/** Fetch the coins currently trending on CoinGecko (top searched in the last 24h). */
export async function getTrending(): Promise<TrendingResponse> {
  return cgFetch<TrendingResponse>("/search/trending");
}

/**
 * Fetch the top coins by market capitalisation.
 *
 * @param limit Number of coins to return (1-250).
 * @param vsCurrency Quote currency, defaults to `"usd"`.
 */
export async function getMarketTop(limit: number, vsCurrency = "usd"): Promise<MarketCoin[]> {
  return cgFetch<MarketCoin[]>("/coins/markets", {
    vs_currency: vsCurrency,
    order: "market_cap_desc",
    per_page: limit,
    page: 1,
    sparkline: "false",
    price_change_percentage: "24h",
  });
}

// ---------------------------------------------------------------------------
// Text formatters — produce human-readable output for tool responses.
// ---------------------------------------------------------------------------

function fmtNum(n: number | null | undefined, opts: Intl.NumberFormatOptions = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return new Intl.NumberFormat("en-US", opts).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatPrice(data: SimplePriceResponse, vsCurrency: string): string {
  const cur = vsCurrency.toLowerCase();
  const ids = Object.keys(data);
  if (ids.length === 0) {
    return "No matching coins found. Check the coin ids (use CoinGecko ids like 'bitcoin', not symbols like 'btc').";
  }
  const lines = ids.map((id) => {
    const entry = data[id];
    const price = entry[cur];
    const mcap = entry[`${cur}_market_cap`];
    const change = entry[`${cur}_24h_change`];
    return [
      `${id}:`,
      `  price:      ${fmtNum(price, { maximumFractionDigits: 8 })} ${cur.toUpperCase()}`,
      `  market cap: ${fmtNum(mcap, { maximumFractionDigits: 0 })} ${cur.toUpperCase()}`,
      `  24h change: ${fmtPct(change)}`,
    ].join("\n");
  });
  return lines.join("\n\n");
}

export function formatTrending(data: TrendingResponse): string {
  if (!data.coins?.length) return "No trending coins returned.";
  const lines = data.coins.map((c, i) => {
    const it = c.item;
    const rank = it.market_cap_rank != null ? `#${it.market_cap_rank}` : "unranked";
    const usdChange = it.data?.price_change_percentage_24h?.usd;
    const changeStr = usdChange != null ? ` (24h ${fmtPct(usdChange)})` : "";
    return `${i + 1}. ${it.name} (${it.symbol.toUpperCase()}) — mkt-cap rank ${rank}${changeStr}`;
  });
  return `Trending on CoinGecko (most searched, last 24h):\n\n${lines.join("\n")}`;
}

export function formatMarketTop(coins: MarketCoin[], vsCurrency: string): string {
  if (!coins.length) return "No market data returned.";
  const cur = vsCurrency.toUpperCase();
  const lines = coins.map((c) => {
    const rank = c.market_cap_rank != null ? `#${c.market_cap_rank}` : "  ?";
    return [
      `${rank.padStart(4)} ${c.name} (${c.symbol.toUpperCase()})`,
      `     price ${fmtNum(c.current_price, { maximumFractionDigits: 8 })} ${cur}`,
      `· mcap ${fmtNum(c.market_cap, { maximumFractionDigits: 0 })} ${cur}`,
      `· 24h ${fmtPct(c.price_change_percentage_24h)}`,
    ].join(" ");
  });
  return `Top ${coins.length} coins by market cap (${cur}):\n\n${lines.join("\n")}`;
}
