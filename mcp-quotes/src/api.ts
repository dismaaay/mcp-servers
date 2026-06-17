/**
 * Core quote-fetching logic.
 *
 * This module intentionally has NO Model Context Protocol imports so it can be
 * unit-tested or reused on its own. It talks to a live, key-free quotes API.
 *
 * Upstream: DummyJSON Quotes (https://dummyjson.com/docs/quotes)
 *   - No API key required.
 *   - GET /quotes/random        -> a single random quote.
 *   - GET /quotes?limit=0       -> the full catalog (~1450 quotes) in one call.
 *
 * The upstream catalog is small and static, so search_quotes and
 * quotes_by_author are implemented by fetching the catalog once (cached in
 * memory for the lifetime of the process) and filtering it locally. This keeps
 * results fast, deterministic, and resilient to the upstream lacking
 * server-side search/author filters.
 */

const API_BASE = "https://dummyjson.com/quotes";
const DEFAULT_TIMEOUT_MS = 10_000;

/** A single quote as exposed by this server. */
export interface Quote {
  id: number;
  text: string;
  author: string;
}

/** Shape of an individual quote object returned by DummyJSON. */
interface UpstreamQuote {
  id: number;
  quote: string;
  author: string;
}

/** Shape of the list endpoint returned by DummyJSON. */
interface UpstreamList {
  quotes: UpstreamQuote[];
  total: number;
  skip: number;
  limit: number;
}

/** Raised for any failure talking to the upstream API. */
export class QuoteApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteApiError";
  }
}

/**
 * fetch with an abort-based timeout. Returns parsed JSON or throws
 * QuoteApiError with a human-readable message.
 */
async function getJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-quotes/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new QuoteApiError(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw new QuoteApiError(
      `Network error contacting quotes API: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new QuoteApiError(`Quotes API returned HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new QuoteApiError(`Quotes API returned a non-JSON response for ${url}`);
  }
}

function normalize(q: UpstreamQuote): Quote {
  return { id: q.id, text: q.quote, author: q.author };
}

// Cache the full catalog in memory once fetched; it is small and static.
let catalogCache: Quote[] | null = null;

/** Fetch (and cache) the full quote catalog. */
export async function getCatalog(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Quote[]> {
  if (catalogCache) return catalogCache;
  const data = await getJson<UpstreamList>(`${API_BASE}?limit=0`, timeoutMs);
  if (!data || !Array.isArray(data.quotes)) {
    throw new QuoteApiError("Quotes API returned an unexpected catalog shape.");
  }
  catalogCache = data.quotes.map(normalize);
  return catalogCache;
}

/**
 * Get one random quote.
 *
 * If `tags` is provided, it is treated as a free-text topic/keyword filter
 * (the upstream dataset has no structured tag field), and a random quote whose
 * text or author matches ANY of the supplied keywords is returned. Falls back
 * to an unfiltered random quote only if nothing matches AND no tags were given.
 */
export async function randomQuote(tags?: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Quote> {
  const keywords = (tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

  if (keywords.length === 0) {
    const q = await getJson<UpstreamQuote>(`${API_BASE}/random`, timeoutMs);
    if (!q || typeof q.quote !== "string") {
      throw new QuoteApiError("Quotes API returned an unexpected random-quote shape.");
    }
    return normalize(q);
  }

  const catalog = await getCatalog(timeoutMs);
  const matches = catalog.filter((q) => {
    const hay = `${q.text} ${q.author}`.toLowerCase();
    return keywords.some((k) => hay.includes(k));
  });
  if (matches.length === 0) {
    throw new QuoteApiError(`No quotes found matching topic(s): ${keywords.join(", ")}`);
  }
  return matches[Math.floor(Math.random() * matches.length)];
}

/**
 * Full-text search across quote text and author name.
 * Returns up to `limit` matches (default 10).
 */
export async function searchQuotes(
  query: string,
  limit = 10,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Quote[]> {
  const q = query.trim().toLowerCase();
  if (!q) throw new QuoteApiError("Search query must not be empty.");
  const catalog = await getCatalog(timeoutMs);
  const matches = catalog.filter(
    (item) =>
      item.text.toLowerCase().includes(q) || item.author.toLowerCase().includes(q),
  );
  return matches.slice(0, Math.max(1, limit));
}

/**
 * Return quotes whose author name matches `author` (case-insensitive
 * substring match, so "einstein" matches "Albert Einstein").
 */
export async function quotesByAuthor(
  author: string,
  limit = 20,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Quote[]> {
  const needle = author.trim().toLowerCase();
  if (!needle) throw new QuoteApiError("Author name must not be empty.");
  const catalog = await getCatalog(timeoutMs);
  const matches = catalog.filter((q) => q.author.toLowerCase().includes(needle));
  return matches.slice(0, Math.max(1, limit));
}
