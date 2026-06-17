/**
 * Core crates.io API client.
 *
 * This module contains NO MCP imports — it is a plain, reusable async API
 * wrapper around the public crates.io REST API (https://crates.io/api/v1).
 * No API key is required. All logging is left to the caller; this module
 * only throws clear Errors.
 */

const API_BASE = "https://crates.io/api/v1";
const REQUEST_TIMEOUT_MS = 10_000;

// crates.io requests a descriptive User-Agent with contact info.
// See: https://crates.io/data-access
const USER_AGENT =
  "mcp-crates/1.0.0 (https://github.com/mcp-catalog/mcp-crates)";

/** A single published version of a crate. */
export interface CrateVersionSummary {
  num: string;
  yanked: boolean;
  license: string | null;
  created_at: string;
  downloads: number;
}

/** Normalized result of getCrate(). */
export interface CrateInfo {
  name: string;
  description: string | null;
  homepage: string | null;
  documentation: string | null;
  repository: string | null;
  keywords: string[];
  categories: string[];
  maxVersion: string | null;
  maxStableVersion: string | null;
  newestVersion: string | null;
  downloads: number;
  recentDownloads: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  numVersions: number;
  recentVersions: CrateVersionSummary[];
}

/** A single hit from searchCrates(). */
export interface CrateSearchHit {
  name: string;
  description: string | null;
  maxVersion: string | null;
  downloads: number;
  recentDownloads: number | null;
  repository: string | null;
  documentation: string | null;
  homepage: string | null;
  exactMatch: boolean;
}

/** Normalized result of searchCrates(). */
export interface CrateSearchResult {
  query: string;
  total: number;
  hits: CrateSearchHit[];
}

/**
 * Perform a GET request against the crates.io API with a hard timeout and
 * clear error messages. Returns the parsed JSON body.
 */
async function apiGet(path: string): Promise<any> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `crates.io request timed out after ${REQUEST_TIMEOUT_MS}ms (${url})`
      );
    }
    throw new Error(
      `Network error contacting crates.io (${url}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new Error("NOT_FOUND");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.text();
      detail = body ? ` — ${body.slice(0, 300)}` : "";
    } catch {
      /* ignore body read errors */
    }
    throw new Error(
      `crates.io returned HTTP ${res.status} ${res.statusText}${detail}`
    );
  }

  try {
    return await res.json();
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from crates.io: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Fetch detailed metadata for a single crate by its exact name.
 *
 * @throws Error with message "NOT_FOUND" if the crate does not exist.
 */
export async function getCrate(name: string): Promise<CrateInfo> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Crate name must not be empty.");
  }

  let data: any;
  try {
    data = await apiGet(`/crates/${encodeURIComponent(trimmed)}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      throw new Error(`Crate "${trimmed}" was not found on crates.io.`);
    }
    throw err;
  }

  const c = data?.crate;
  if (!c) {
    throw new Error(
      `Unexpected response from crates.io for "${trimmed}" (missing "crate").`
    );
  }

  // The top-level response includes a "versions" array (full objects) when
  // requesting a single crate. Map the most recent few.
  const versions: any[] = Array.isArray(data.versions) ? data.versions : [];
  const recentVersions: CrateVersionSummary[] = versions
    .slice(0, 5)
    .map((v) => ({
      num: String(v?.num ?? ""),
      yanked: Boolean(v?.yanked),
      license: v?.license ?? null,
      created_at: v?.created_at ?? "",
      downloads: Number(v?.downloads ?? 0),
    }));

  return {
    name: c.name,
    description: c.description ?? null,
    homepage: c.homepage ?? null,
    documentation: c.documentation ?? null,
    repository: c.repository ?? null,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    categories: Array.isArray(c.categories) ? c.categories : [],
    maxVersion: c.max_version ?? null,
    maxStableVersion: c.max_stable_version ?? null,
    newestVersion: c.newest_version ?? null,
    downloads: Number(c.downloads ?? 0),
    recentDownloads:
      c.recent_downloads === null || c.recent_downloads === undefined
        ? null
        : Number(c.recent_downloads),
    createdAt: c.created_at ?? null,
    updatedAt: c.updated_at ?? null,
    numVersions:
      typeof c.num_versions === "number" ? c.num_versions : versions.length,
    recentVersions,
  };
}

/**
 * Search crates.io for crates matching a free-text query.
 *
 * @param query   Search terms.
 * @param perPage Max results to return (1–100, default 10).
 */
export async function searchCrates(
  query: string,
  perPage = 10
): Promise<CrateSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Search query must not be empty.");
  }

  const safePerPage = Math.min(100, Math.max(1, Math.floor(perPage)));
  const params = new URLSearchParams({
    q: trimmed,
    per_page: String(safePerPage),
  });

  const data = await apiGet(`/crates?${params.toString()}`);

  const rawHits: any[] = Array.isArray(data?.crates) ? data.crates : [];
  const hits: CrateSearchHit[] = rawHits.map((c) => ({
    name: c.name,
    description: c.description ?? null,
    maxVersion: c.max_version ?? c.newest_version ?? null,
    downloads: Number(c.downloads ?? 0),
    recentDownloads:
      c.recent_downloads === null || c.recent_downloads === undefined
        ? null
        : Number(c.recent_downloads),
    repository: c.repository ?? null,
    documentation: c.documentation ?? null,
    homepage: c.homepage ?? null,
    exactMatch: Boolean(c.exact_match),
  }));

  const total =
    typeof data?.meta?.total === "number" ? data.meta.total : hits.length;

  return {
    query: trimmed,
    total,
    hits,
  };
}
