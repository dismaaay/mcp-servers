/**
 * Core GitHub Search API client.
 *
 * This module deliberately contains NO MCP imports so it can be unit-tested
 * and reused independently of the MCP transport layer.
 *
 * Uses the public GitHub REST search API (https://docs.github.com/en/rest/search).
 * No authentication is required, but unauthenticated requests are rate-limited
 * (currently 10 requests/minute for search). An optional GITHUB_TOKEN
 * environment variable, if present, is sent as a Bearer token to raise limits.
 */

const GITHUB_API_BASE = "https://api.github.com/search";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-github-search/1.0.0";

/** Allowed sort values for repository search. */
export type RepoSort = "stars" | "forks" | "help-wanted-issues" | "updated" | "best-match";

export interface RepoResult {
  full_name: string;
  description: string | null;
  html_url: string;
  stars: number;
  forks: number;
  language: string | null;
  updated_at: string;
}

export interface CodeResult {
  name: string;
  path: string;
  repository: string;
  html_url: string;
}

export interface UserResult {
  login: string;
  type: string;
  html_url: string;
  score: number;
}

export interface SearchResponse<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

/** Error thrown for any failure talking to the GitHub API. */
export class GitHubApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/**
 * Performs a GET against the GitHub search API with a hard timeout and
 * consistent error handling. Returns the parsed JSON body.
 */
async function githubGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GITHUB_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Optional auth to raise rate limits; works fine without it.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GitHubApiError(
        `GitHub request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      );
    }
    throw new GitHubApiError(
      `Network error talking to GitHub: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Try to surface GitHub's own error message and rate-limit hints.
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = ` - ${body.message}`;
    } catch {
      /* ignore non-JSON bodies */
    }
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        const reset = res.headers.get("x-ratelimit-reset");
        const when = reset
          ? new Date(Number(reset) * 1000).toISOString()
          : "shortly";
        throw new GitHubApiError(
          `GitHub rate limit exceeded${detail}. Resets at ${when}. ` +
            `Set GITHUB_TOKEN to raise the limit.`,
          res.status
        );
      }
    }
    throw new GitHubApiError(
      `GitHub API returned ${res.status} ${res.statusText}${detail}`,
      res.status
    );
  }

  return (await res.json()) as T;
}

/** Search public repositories. */
export async function searchRepos(
  query: string,
  sort?: RepoSort,
  perPage = 10
): Promise<SearchResponse<RepoResult>> {
  if (!query.trim()) throw new GitHubApiError("query must not be empty");

  const params: Record<string, string> = { q: query, per_page: String(perPage) };
  // "best-match" is GitHub's default and is expressed by omitting `sort`.
  if (sort && sort !== "best-match") {
    params.sort = sort;
    params.order = "desc";
  }

  const raw = await githubGet<SearchResponse<any>>("repositories", params);
  return {
    total_count: raw.total_count,
    incomplete_results: raw.incomplete_results,
    items: raw.items.map((r) => ({
      full_name: r.full_name,
      description: r.description ?? null,
      html_url: r.html_url,
      stars: r.stargazers_count ?? 0,
      forks: r.forks_count ?? 0,
      language: r.language ?? null,
      updated_at: r.updated_at,
    })),
  };
}

/** Search code across public repositories. */
export async function searchCode(
  query: string,
  perPage = 10
): Promise<SearchResponse<CodeResult>> {
  if (!query.trim()) throw new GitHubApiError("query must not be empty");

  const raw = await githubGet<SearchResponse<any>>("code", {
    q: query,
    per_page: String(perPage),
  });
  return {
    total_count: raw.total_count,
    incomplete_results: raw.incomplete_results,
    items: raw.items.map((c) => ({
      name: c.name,
      path: c.path,
      repository: c.repository?.full_name ?? "unknown",
      html_url: c.html_url,
    })),
  };
}

/** Search GitHub users and organizations. */
export async function searchUsers(
  query: string,
  perPage = 10
): Promise<SearchResponse<UserResult>> {
  if (!query.trim()) throw new GitHubApiError("query must not be empty");

  const raw = await githubGet<SearchResponse<any>>("users", {
    q: query,
    per_page: String(perPage),
  });
  return {
    total_count: raw.total_count,
    incomplete_results: raw.incomplete_results,
    items: raw.items.map((u) => ({
      login: u.login,
      type: u.type,
      html_url: u.html_url,
      score: u.score ?? 0,
    })),
  };
}
