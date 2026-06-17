/**
 * Core Docker Hub API client.
 *
 * This module has NO dependency on the MCP SDK so it can be unit-tested or
 * reused independently. It talks to the public Docker Hub v2 REST API, which
 * requires no authentication for public repositories.
 *
 * Docs: https://docs.docker.com/docker-hub/api/latest/
 */

const BASE_URL = "https://hub.docker.com/v2";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Raised for any Docker Hub API / network failure with a human-readable message. */
export class DockerHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DockerHubError";
  }
}

/**
 * Normalize a user-supplied repo string into Docker Hub's "namespace/name" form.
 *
 * Docker Hub stores official images (e.g. "nginx") under the "library"
 * namespace. A bare name like "nginx" therefore maps to "library/nginx",
 * while "bitnami/redis" is used as-is.
 */
export function normalizeRepo(repo: string): { namespace: string; name: string; canonical: string } {
  const trimmed = (repo ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    throw new DockerHubError("Repository name is required (e.g. 'nginx' or 'bitnami/redis').");
  }
  const parts = trimmed.split("/");
  if (parts.length > 2) {
    throw new DockerHubError(
      `Invalid repository '${repo}'. Expected 'name' or 'namespace/name'.`,
    );
  }
  const namespace = parts.length === 2 ? parts[0] : "library";
  const name = parts.length === 2 ? parts[1] : parts[0];
  if (!namespace || !name) {
    throw new DockerHubError(
      `Invalid repository '${repo}'. Expected 'name' or 'namespace/name'.`,
    );
  }
  return { namespace, name, canonical: `${namespace}/${name}` };
}

/** Perform a GET against Docker Hub with a timeout and friendly error handling. */
async function getJSON<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "mcp-dockerhub/1.0 (+https://github.com/mcp-catalog/mcp-dockerhub)",
      },
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new DockerHubError(
          `Repository not found on Docker Hub (HTTP 404). Check the name and namespace.`,
        );
      }
      if (res.status === 429) {
        throw new DockerHubError(
          `Docker Hub rate limit hit (HTTP 429). Please wait and try again.`,
        );
      }
      throw new DockerHubError(`Docker Hub request failed: HTTP ${res.status} ${res.statusText}.`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DockerHubError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new DockerHubError(`Docker Hub request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s.`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new DockerHubError(`Network error talking to Docker Hub: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Shape of the repository detail endpoint we care about. */
export interface DockerHubImage {
  user: string;
  name: string;
  namespace: string;
  repository_type: string | null;
  status_description?: string;
  description: string | null;
  is_private: boolean;
  is_automated?: boolean;
  star_count: number;
  pull_count: number;
  last_updated: string | null;
  date_registered?: string | null;
  full_description?: string | null;
}

export interface ImageSummary {
  repository: string;
  description: string | null;
  is_private: boolean;
  is_official: boolean;
  star_count: number;
  pull_count: number;
  last_updated: string | null;
  url: string;
}

/** Fetch repository metadata for a Docker Hub image. */
export async function getImage(repo: string): Promise<ImageSummary> {
  const { namespace, name, canonical } = normalizeRepo(repo);
  const data = await getJSON<DockerHubImage>(
    `/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/`,
  );
  return {
    repository: canonical,
    description: data.description ?? null,
    is_private: Boolean(data.is_private),
    is_official: namespace === "library",
    star_count: data.star_count ?? 0,
    pull_count: data.pull_count ?? 0,
    last_updated: data.last_updated ?? null,
    url: `https://hub.docker.com/r/${canonical}`,
  };
}

interface TagImage {
  architecture: string | null;
  os: string | null;
  variant: string | null;
  size: number | null;
  digest: string | null;
}

interface TagResult {
  name: string;
  full_size: number | null;
  last_updated: string | null;
  tag_status?: string | null;
  digest?: string | null;
  images?: TagImage[];
}

interface TagsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: TagResult[];
}

export interface TagSummary {
  name: string;
  full_size: number | null;
  last_updated: string | null;
  digest: string | null;
  architectures: string[];
}

export interface ListTagsResult {
  repository: string;
  total_count: number;
  returned: number;
  tags: TagSummary[];
}

/**
 * List tags for a Docker Hub repository.
 *
 * @param repo      "name" or "namespace/name"
 * @param pageSize  number of tags to return (1-100, default 25)
 */
export async function listTags(repo: string, pageSize = 25): Promise<ListTagsResult> {
  const { namespace, name, canonical } = normalizeRepo(repo);
  const size = Math.min(Math.max(Math.trunc(pageSize) || 25, 1), 100);
  const data = await getJSON<TagsResponse>(
    `/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/tags?page_size=${size}&ordering=last_updated`,
  );
  const tags: TagSummary[] = (data.results ?? []).map((t) => {
    const architectures = Array.from(
      new Set(
        (t.images ?? [])
          .map((img) => {
            if (!img.architecture || img.architecture === "unknown") return null;
            return img.variant ? `${img.architecture}/${img.variant}` : img.architecture;
          })
          .filter((a): a is string => Boolean(a)),
      ),
    );
    return {
      name: t.name,
      full_size: t.full_size ?? null,
      last_updated: t.last_updated ?? null,
      digest: t.digest ?? null,
      architectures,
    };
  });
  return {
    repository: canonical,
    total_count: data.count ?? tags.length,
    returned: tags.length,
    tags,
  };
}
