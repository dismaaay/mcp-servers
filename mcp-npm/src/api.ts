/**
 * Core npm registry API client.
 *
 * No MCP imports here on purpose: this module is plain, testable logic that
 * talks to the public npm registry over `fetch`. It can be unit-tested or
 * reused independently of the MCP transport layer.
 *
 * Endpoints used (all public, no API key required):
 *   - https://registry.npmjs.org/<name>            (package metadata / packument)
 *   - https://registry.npmjs.org/-/v1/search       (full-text search)
 *   - https://api.npmjs.org/downloads/point/<p>/<name>  (download counts)
 */

const REGISTRY_BASE = "https://registry.npmjs.org";
const DOWNLOADS_BASE = "https://api.npmjs.org/downloads";
const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-npm/1.0.0 (+https://www.npmjs.com)";

/** Valid download period values accepted by the npm downloads API. */
export const DOWNLOAD_PERIODS = [
  "last-day",
  "last-week",
  "last-month",
  "last-year",
] as const;
export type DownloadPeriod = (typeof DOWNLOAD_PERIODS)[number];

export interface PackageSummary {
  name: string;
  description?: string;
  latestVersion?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  author?: string;
  keywords?: string[];
  maintainers?: string[];
  distTags?: Record<string, string>;
  versionCount?: number;
  lastPublished?: string;
}

export interface SearchResultItem {
  name: string;
  version?: string;
  description?: string;
  publisher?: string;
  score?: number;
  date?: string;
  links?: Record<string, string>;
}

export interface SearchResults {
  query: string;
  total: number;
  results: SearchResultItem[];
}

export interface DownloadStats {
  package: string;
  period: DownloadPeriod;
  downloads: number;
  start: string;
  end: string;
}

/**
 * Thrown for any user-facing failure (bad input, not found, network/timeout,
 * upstream error). Carries a clean message safe to surface to the model.
 */
export class NpmApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NpmApiError";
  }
}

/** fetch wrapper with a hard timeout and consistent error handling. */
async function fetchJson(url: string, what: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new NpmApiError(
        `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s while fetching ${what}.`,
      );
    }
    throw new NpmApiError(
      `Network error while fetching ${what}: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new NpmApiError(`${what} not found (404).`);
  }
  if (!res.ok) {
    throw new NpmApiError(
      `Upstream npm API returned HTTP ${res.status} ${res.statusText} for ${what}.`,
    );
  }

  try {
    return await res.json();
  } catch {
    throw new NpmApiError(`Failed to parse JSON response for ${what}.`);
  }
}

/** Normalize the various author/repository shapes npm uses into a string. */
function asPerson(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.email === "string") return o.email;
    if (typeof o.username === "string") return o.username;
  }
  return undefined;
}

function asRepoUrl(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
  }
  return undefined;
}

function validatePackageName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new NpmApiError("Package name must not be empty.");
  }
  // npm allows scoped names like @scope/name; reject obvious junk / spaces.
  if (/\s/.test(trimmed)) {
    throw new NpmApiError(`Invalid package name: "${name}".`);
  }
  return trimmed;
}

/**
 * Fetch metadata for a single package (the "packument") and reduce it to a
 * useful summary describing the latest published version.
 */
export async function getPackage(name: string): Promise<PackageSummary> {
  const pkg = validatePackageName(name);
  const data = (await fetchJson(
    `${REGISTRY_BASE}/${encodeURIComponent(pkg).replace("%40", "@")}`,
    `package "${pkg}"`,
  )) as Record<string, any>;

  const distTags = (data["dist-tags"] ?? {}) as Record<string, string>;
  const latestVersion = distTags.latest;
  const versions = (data.versions ?? {}) as Record<string, any>;
  const latest = latestVersion ? versions[latestVersion] : undefined;
  const meta = latest ?? data;

  const time = (data.time ?? {}) as Record<string, string>;
  const lastPublished = latestVersion ? time[latestVersion] : time.modified;

  const maintainers = Array.isArray(data.maintainers)
    ? (data.maintainers
        .map((m: unknown) => asPerson(m))
        .filter(Boolean) as string[])
    : undefined;

  return {
    name: data.name ?? pkg,
    description: meta.description ?? data.description,
    latestVersion,
    license: typeof meta.license === "string" ? meta.license : asPerson(meta.license),
    homepage: data.homepage ?? meta.homepage,
    repository: asRepoUrl(data.repository ?? meta.repository),
    author: asPerson(data.author ?? meta.author),
    keywords: Array.isArray(meta.keywords) ? meta.keywords : data.keywords,
    maintainers,
    distTags,
    versionCount: Object.keys(versions).length || undefined,
    lastPublished,
  };
}

/**
 * Full-text search the npm registry. Returns the top results with score and
 * publisher info.
 */
export async function searchPackages(
  query: string,
  limit = 10,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) {
    throw new NpmApiError("Search query must not be empty.");
  }
  const size = Math.min(Math.max(1, Math.floor(limit)), 25);
  const url = `${REGISTRY_BASE}/-/v1/search?text=${encodeURIComponent(q)}&size=${size}`;
  const data = (await fetchJson(url, `search for "${q}"`)) as Record<string, any>;

  const objects = Array.isArray(data.objects) ? data.objects : [];
  const results: SearchResultItem[] = objects.map((o: any) => {
    const p = o.package ?? {};
    return {
      name: p.name,
      version: p.version,
      description: p.description,
      publisher: asPerson(p.publisher),
      score:
        typeof o.searchScore === "number"
          ? Math.round(o.searchScore * 1000) / 1000
          : undefined,
      date: p.date,
      links: p.links,
    };
  });

  return {
    query: q,
    total: typeof data.total === "number" ? data.total : results.length,
    results,
  };
}

/**
 * Fetch download counts for a package over a fixed period.
 */
export async function getDownloads(
  name: string,
  period: string = "last-week",
): Promise<DownloadStats> {
  const pkg = validatePackageName(name);
  if (!DOWNLOAD_PERIODS.includes(period as DownloadPeriod)) {
    throw new NpmApiError(
      `Invalid period "${period}". Must be one of: ${DOWNLOAD_PERIODS.join(", ")}.`,
    );
  }
  const url = `${DOWNLOADS_BASE}/point/${period}/${encodeURIComponent(pkg).replace("%40", "@")}`;
  const data = (await fetchJson(
    url,
    `downloads for "${pkg}" (${period})`,
  )) as Record<string, any>;

  if (typeof data.downloads !== "number") {
    throw new NpmApiError(
      `No download data available for "${pkg}" over ${period}.`,
    );
  }

  return {
    package: data.package ?? pkg,
    period: period as DownloadPeriod,
    downloads: data.downloads,
    start: data.start,
    end: data.end,
  };
}
