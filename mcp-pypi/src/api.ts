/**
 * Core PyPI JSON API client.
 *
 * This module contains NO MCP / protocol imports. It is a plain, testable
 * wrapper around the public PyPI JSON API (https://pypi.org/pypi/<pkg>/json),
 * which requires no API key.
 *
 * All logging here is intentionally avoided; callers decide what to log
 * (the MCP server logs only to stderr).
 */

const PYPI_BASE = "https://pypi.org/pypi";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-pypi/1.0.0 (+https://pypi.org)";

/** Error raised when a package cannot be found on PyPI. */
export class PackageNotFoundError extends Error {
  constructor(name: string) {
    super(`Package "${name}" was not found on PyPI.`);
    this.name = "PackageNotFoundError";
  }
}

/** Error raised for any other PyPI / network failure. */
export class PyPIApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PyPIApiError";
  }
}

/** A normalized view of a PyPI package's current metadata. */
export interface PackageSummary {
  name: string;
  version: string;
  summary: string | null;
  description: string;
  author: string | null;
  authorEmail: string | null;
  license: string | null;
  homepage: string | null;
  packageUrl: string | null;
  requiresPython: string | null;
  keywords: string | null;
  classifiers: string[];
  projectUrls: Record<string, string>;
  requiresDist: string[];
  releaseCount: number;
  vulnerabilityCount: number;
}

/** A single release version with summary info. */
export interface ReleaseInfo {
  version: string;
  uploadTime: string | null;
  fileCount: number;
  yanked: boolean;
  packageTypes: string[];
}

interface RawFile {
  filename?: string;
  packagetype?: string;
  upload_time_iso_8601?: string;
  yanked?: boolean;
}

interface RawPyPIResponse {
  info: {
    name?: string;
    version?: string;
    summary?: string | null;
    description?: string | null;
    author?: string | null;
    author_email?: string | null;
    license?: string | null;
    license_expression?: string | null;
    home_page?: string | null;
    package_url?: string | null;
    requires_python?: string | null;
    keywords?: string | null;
    classifiers?: string[] | null;
    project_urls?: Record<string, string> | null;
    requires_dist?: string[] | null;
  };
  releases: Record<string, RawFile[]>;
  vulnerabilities?: unknown[];
}

/**
 * Validate a package name. PyPI normalizes names but we keep this loose:
 * reject empty / whitespace-only and anything with path separators that could
 * escape the endpoint.
 */
function validatePackageName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    throw new PyPIApiError("Package name must be a non-empty string.");
  }
  if (/[\/\\?#]/.test(trimmed)) {
    throw new PyPIApiError(
      `Invalid package name "${name}": must not contain / \\ ? or # characters.`
    );
  }
  return trimmed;
}

/** Fetch and parse the raw PyPI JSON document for a package. */
async function fetchPackage(name: string): Promise<RawPyPIResponse> {
  const cleanName = validatePackageName(name);
  const url = `${PYPI_BASE}/${encodeURIComponent(cleanName)}/json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PyPIApiError(
        `Request to PyPI timed out after ${REQUEST_TIMEOUT_MS}ms for package "${cleanName}".`
      );
    }
    throw new PyPIApiError(
      `Network error contacting PyPI for "${cleanName}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new PackageNotFoundError(cleanName);
  }
  if (!res.ok) {
    throw new PyPIApiError(
      `PyPI returned HTTP ${res.status} (${res.statusText}) for package "${cleanName}".`
    );
  }

  try {
    return (await res.json()) as RawPyPIResponse;
  } catch (err) {
    throw new PyPIApiError(
      `Failed to parse PyPI JSON response for "${cleanName}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * PEP 440-aware-ish version comparison. Not a full implementation, but good
 * enough to sort real release histories: compares dotted numeric segments
 * numerically and falls back to string compare for pre-release suffixes.
 */
function compareVersions(a: string, b: string): number {
  const splitParts = (v: string) =>
    v.split(/[.+]/).map((p) => {
      const num = Number(p);
      return Number.isNaN(num) ? p : num;
    });

  const pa = splitParts(a);
  const pb = splitParts(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x - y;
    } else {
      // a pure-numeric segment sorts after a string segment (e.g. rc vs final)
      const xs = String(x);
      const ys = String(y);
      const xIsNum = typeof x === "number";
      const yIsNum = typeof y === "number";
      if (xIsNum !== yIsNum) return xIsNum ? 1 : -1;
      if (xs !== ys) return xs < ys ? -1 : 1;
    }
  }
  return 0;
}

/** Get a normalized summary of a package's current/latest metadata. */
export async function getPackage(name: string): Promise<PackageSummary> {
  const data = await fetchPackage(name);
  const info = data.info ?? {};
  const description = info.description ?? "";

  return {
    name: info.name ?? name,
    version: info.version ?? "unknown",
    summary: info.summary ?? null,
    // Truncate the (often huge) long description to keep tool output sane.
    description:
      description.length > 2000
        ? `${description.slice(0, 2000)}\n...[truncated]`
        : description,
    author: info.author ?? null,
    authorEmail: info.author_email ?? null,
    license: info.license_expression || info.license || null,
    homepage: info.home_page ?? null,
    packageUrl: info.package_url ?? null,
    requiresPython: info.requires_python ?? null,
    keywords: info.keywords ?? null,
    classifiers: info.classifiers ?? [],
    projectUrls: info.project_urls ?? {},
    requiresDist: info.requires_dist ?? [],
    releaseCount: Object.keys(data.releases ?? {}).length,
    vulnerabilityCount: Array.isArray(data.vulnerabilities)
      ? data.vulnerabilities.length
      : 0,
  };
}

/**
 * Get the release history for a package, sorted newest-first.
 *
 * @param name  package name
 * @param limit max number of releases to return (default 25)
 */
export async function getReleases(
  name: string,
  limit = 25
): Promise<{ name: string; latest: string; total: number; releases: ReleaseInfo[] }> {
  const data = await fetchPackage(name);
  const releases = data.releases ?? {};
  const versions = Object.keys(releases);

  versions.sort((a, b) => compareVersions(b, a)); // newest first

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 25;

  const result: ReleaseInfo[] = versions.slice(0, safeLimit).map((version) => {
    const files = releases[version] ?? [];
    const uploadTime = files.find((f) => f.upload_time_iso_8601)?.upload_time_iso_8601 ?? null;
    const yanked = files.length > 0 && files.every((f) => f.yanked === true);
    const packageTypes = Array.from(
      new Set(files.map((f) => f.packagetype).filter((p): p is string => Boolean(p)))
    );
    return {
      version,
      uploadTime,
      fileCount: files.length,
      yanked,
      packageTypes,
    };
  });

  return {
    name: data.info?.name ?? name,
    latest: data.info?.version ?? (versions[0] ?? "unknown"),
    total: versions.length,
    releases: result,
  };
}
