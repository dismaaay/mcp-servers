/**
 * Core logic for the Public APIs Directory.
 *
 * This module wraps the community-maintained public-apis directory (the same
 * data that powered the legacy api.publicapis.org service). It contains NO MCP
 * imports so it can be unit-tested and reused independently.
 *
 * Data source: the JSON mirror of the public-apis/public-apis project, kept in
 * the canonical `{ count, entries: [...] }` shape with the original fields:
 *   API, Description, Auth, HTTPS, Cors, Link, Category
 */

/** A single entry in the public-apis directory. */
export interface ApiEntry {
  /** Name of the API, e.g. "Cat Facts". */
  API: string;
  /** Short human description. */
  Description: string;
  /** Auth scheme: "" (none), "apiKey", "OAuth", "X-Mashape-Key", etc. */
  Auth: string;
  /** Whether the API supports HTTPS. */
  HTTPS: boolean;
  /** CORS support: "yes" | "no" | "unknown". */
  Cors: string;
  /** Homepage / docs URL. */
  Link: string;
  /** Category, e.g. "Animals". */
  Category: string;
}

interface ResourcesPayload {
  count: number;
  entries: ApiEntry[];
}

/**
 * Primary + fallback data sources. The legacy api.publicapis.org host is
 * frequently down, so we read from a maintained JSON mirror of the repo that
 * preserves the exact original schema. Multiple mirrors are tried in order.
 */
const DATA_SOURCES = [
  "https://raw.githubusercontent.com/marcelscruz/public-apis/master/db/resources.json",
  "https://raw.githubusercontent.com/marcelscruz/dev-resources/main/db/resources.json",
];

const REQUEST_TIMEOUT_MS = 10_000;

/** In-process cache so we hit the network at most once per process lifetime. */
let cache: ApiEntry[] | null = null;

/**
 * Fetch with an enforced timeout using AbortController. Throws a clear error on
 * timeout or non-2xx responses.
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-public-apis/1.0" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load all directory entries, trying each data source in order. Results are
 * cached in-process. Logs progress to stderr only (never stdout — stdout is the
 * MCP transport).
 */
export async function loadEntries(): Promise<ApiEntry[]> {
  if (cache) return cache;

  const errors: string[] = [];

  for (const url of DATA_SOURCES) {
    try {
      console.error(`[mcp-public-apis] fetching directory from ${url}`);
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        errors.push(`${url} -> HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const data = (await res.json()) as ResourcesPayload;
      if (!data || !Array.isArray(data.entries) || data.entries.length === 0) {
        errors.push(`${url} -> unexpected/empty payload`);
        continue;
      }
      cache = data.entries;
      console.error(
        `[mcp-public-apis] loaded ${cache.length} API entries`,
      );
      return cache;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const reason =
        err instanceof Error && err.name === "AbortError"
          ? `timed out after ${REQUEST_TIMEOUT_MS}ms`
          : msg;
      errors.push(`${url} -> ${reason}`);
    }
  }

  throw new Error(
    `Failed to load the public-apis directory from all sources:\n  - ${errors.join(
      "\n  - ",
    )}`,
  );
}

/** Options for {@link searchApis}. */
export interface SearchOptions {
  /** Case-insensitive substring matched against API name and description. */
  query: string;
  /** Optional case-insensitive category filter (exact category name). */
  category?: string;
  /** Max results to return (default 25, capped at 100). */
  limit?: number;
}

/** Result of a search. */
export interface SearchResult {
  total: number;
  returned: number;
  results: ApiEntry[];
}

/**
 * Search the directory. Matches the query against the API name and description
 * (case-insensitive substring). When `category` is supplied, only entries in
 * that category (case-insensitive exact match) are considered.
 */
export async function searchApis(opts: SearchOptions): Promise<SearchResult> {
  const query = (opts.query ?? "").trim();
  if (!query) {
    throw new Error("`query` must be a non-empty string.");
  }
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const q = query.toLowerCase();
  const cat = opts.category?.trim().toLowerCase();

  const entries = await loadEntries();

  if (cat) {
    const known = new Set(entries.map((e) => e.Category.toLowerCase()));
    if (!known.has(cat)) {
      throw new Error(
        `Unknown category "${opts.category}". Use list_categories to see valid categories.`,
      );
    }
  }

  const matched = entries.filter((e) => {
    if (cat && e.Category.toLowerCase() !== cat) return false;
    const haystack = `${e.API} ${e.Description}`.toLowerCase();
    return haystack.includes(q);
  });

  return {
    total: matched.length,
    returned: Math.min(matched.length, limit),
    results: matched.slice(0, limit),
  };
}

/** A category and how many APIs it contains. */
export interface CategoryCount {
  category: string;
  count: number;
}

/**
 * List every category in the directory, sorted alphabetically, with the number
 * of APIs in each.
 */
export async function listCategories(): Promise<CategoryCount[]> {
  const entries = await loadEntries();
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.Category, (counts.get(e.Category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
