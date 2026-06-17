/**
 * Core GitHub public REST API client.
 *
 * This module has ZERO MCP dependencies so it can be unit-tested and reused
 * independently. All network calls use the global `fetch` (Node 20+), enforce a
 * 10-second timeout, and surface clear, typed errors.
 */

const GITHUB_API_BASE = "https://api.github.com";
const USER_AGENT = "mcp-github-public/1.0.0";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Error thrown for any failed GitHub API interaction. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/** Minimal shape of a GitHub user we surface to the model. */
export interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  html_url: string;
  created_at: string;
  type: string;
}

/** Minimal shape of a GitHub repository we surface to the model. */
export interface GitHubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  topics?: string[];
  license: { spdx_id: string | null; name: string } | null;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  pushed_at: string;
  created_at: string;
  updated_at: string;
}

interface SearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

/**
 * Perform a JSON GET against the GitHub API with a hard timeout and
 * normalized error handling.
 */
async function githubGet<T>(path: string): Promise<T> {
  const url = `${GITHUB_API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GitHubApiError(
        `Request to ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`,
      );
    }
    throw new GitHubApiError(
      `Network error calling ${path}: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 404) {
    throw new GitHubApiError(`Not found: ${path}`, 404);
  }

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    let hint = "";
    if (remaining === "0" && reset) {
      const when = new Date(Number(reset) * 1000).toISOString();
      hint = ` Unauthenticated rate limit exhausted; resets at ${when}.`;
    }
    throw new GitHubApiError(
      `GitHub rate limit / access error (HTTP ${res.status}).${hint}`,
      res.status,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = `: ${body.message}`;
    } catch {
      /* ignore body parse errors */
    }
    throw new GitHubApiError(
      `GitHub API error (HTTP ${res.status})${detail}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

/** Fetch a single public user/org profile. */
export async function getUser(username: string): Promise<GitHubUser> {
  const u = username.trim();
  if (!u) throw new GitHubApiError("username must not be empty");
  return githubGet<GitHubUser>(`/users/${encodeURIComponent(u)}`);
}

/** Fetch a single public repository. */
export async function getRepo(owner: string, repo: string): Promise<GitHubRepo> {
  const o = owner.trim();
  const r = repo.trim();
  if (!o || !r) throw new GitHubApiError("owner and repo must not be empty");
  return githubGet<GitHubRepo>(
    `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`,
  );
}

/** List a user's public repositories (most recently pushed first). */
export async function listRepos(
  username: string,
  perPage = 30,
): Promise<GitHubRepo[]> {
  const u = username.trim();
  if (!u) throw new GitHubApiError("username must not be empty");
  const pp = Math.min(Math.max(perPage, 1), 100);
  return githubGet<GitHubRepo[]>(
    `/users/${encodeURIComponent(u)}/repos?per_page=${pp}&sort=pushed`,
  );
}

/** Search public repositories, sorted by stars (best matches first). */
export async function searchRepos(
  query: string,
  perPage = 10,
): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) throw new GitHubApiError("query must not be empty");
  const pp = Math.min(Math.max(perPage, 1), 50);
  return githubGet<SearchResponse>(
    `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${pp}`,
  );
}

/* ----------------------------- Formatters ----------------------------- */

function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatUser(u: GitHubUser): string {
  const lines = [
    `${u.name ?? u.login} (@${u.login})  [${u.type}]`,
    u.bio ? `Bio: ${u.bio}` : null,
    u.company ? `Company: ${u.company}` : null,
    u.location ? `Location: ${u.location}` : null,
    u.blog ? `Website: ${u.blog}` : null,
    `Public repos: ${num(u.public_repos)} | Gists: ${num(u.public_gists)}`,
    `Followers: ${num(u.followers)} | Following: ${num(u.following)}`,
    `Joined: ${u.created_at.slice(0, 10)}`,
    `Profile: ${u.html_url}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatRepo(r: GitHubRepo): string {
  const lines = [
    `${r.full_name}${r.archived ? " [ARCHIVED]" : ""}${r.fork ? " [fork]" : ""}`,
    r.description ? r.description : "(no description)",
    `Stars: ${num(r.stargazers_count)} | Forks: ${num(r.forks_count)} | Open issues: ${num(r.open_issues_count)}`,
    r.language ? `Language: ${r.language}` : null,
    r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION"
      ? `License: ${r.license.spdx_id}`
      : null,
    r.topics && r.topics.length ? `Topics: ${r.topics.join(", ")}` : null,
    r.homepage ? `Homepage: ${r.homepage}` : null,
    `Default branch: ${r.default_branch} | Last push: ${r.pushed_at.slice(0, 10)}`,
    `URL: ${r.html_url}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatRepoLine(r: GitHubRepo): string {
  const desc = r.description ? ` — ${r.description}` : "";
  const lang = r.language ? ` [${r.language}]` : "";
  return `★ ${num(r.stargazers_count).padStart(8)}  ${r.full_name}${lang}${desc}`;
}
