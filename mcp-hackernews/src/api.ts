/**
 * Core Hacker News API client.
 *
 * Pure data layer — NO MCP imports here so it can be unit-tested in isolation.
 * Wraps two public, key-free APIs:
 *   - Firebase:  https://hacker-news.firebaseio.com/v0   (top stories, items)
 *   - Algolia:   https://hn.algolia.com/api/v1            (full-text search)
 *
 * All network calls have a hard timeout and surface clear, actionable errors.
 */

const FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Shape of an item returned by the Firebase `/item/<id>.json` endpoint. */
export interface HnItem {
  id: number;
  type?: "job" | "story" | "comment" | "poll" | "pollopt";
  by?: string;
  time?: number; // unix seconds
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number; // total comment count for stories/polls
  kids?: number[]; // direct child comment ids
  dead?: boolean;
  deleted?: boolean;
  parent?: number;
}

/** Normalized search hit from the Algolia `/search` endpoint. */
export interface HnSearchHit {
  id: number;
  title: string;
  url: string | null;
  author: string;
  points: number;
  numComments: number;
  createdAt: string; // ISO timestamp
  hnUrl: string;
}

/** Fetch JSON with a timeout and clear error messages. */
async function fetchJson<T>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText} from ${url}`,
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request to ${url} timed out after ${timeoutMs}ms`,
      );
    }
    if (err instanceof Error) {
      throw new Error(`Failed to fetch ${url}: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Canonical link to an item on the Hacker News website. */
export function hnItemUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

/**
 * Get the current top stories (full item objects), in HN ranking order.
 * @param limit number of stories to return (1..100)
 */
export async function getTopStories(
  limit: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HnItem[]> {
  const clamped = Math.max(1, Math.min(100, Math.floor(limit)));
  const ids = await fetchJson<number[]>(
    `${FIREBASE_BASE}/topstories.json`,
    timeoutMs,
  );
  if (!Array.isArray(ids)) {
    throw new Error("Unexpected response: topstories did not return an array");
  }
  const targetIds = ids.slice(0, clamped);
  const items = await Promise.all(
    targetIds.map((id) =>
      fetchJson<HnItem>(`${FIREBASE_BASE}/item/${id}.json`, timeoutMs),
    ),
  );
  // Firebase can occasionally return null for deleted items; filter them out.
  return items.filter((it): it is HnItem => it != null && it.id != null);
}

/**
 * Get a single item (story, comment, job, poll) by id.
 * @param id Hacker News item id
 */
export async function getStory(
  id: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HnItem> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid item id: ${id}`);
  }
  const item = await fetchJson<HnItem | null>(
    `${FIREBASE_BASE}/item/${id}.json`,
    timeoutMs,
  );
  if (item == null) {
    throw new Error(`No Hacker News item found with id ${id}`);
  }
  return item;
}

/**
 * Full-text search across Hacker News stories via Algolia.
 * Results are sorted by relevance.
 * @param query search terms
 * @param limit number of hits to return (1..50)
 */
export async function searchStories(
  query: string,
  limit: number = 10,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HnSearchHit[]> {
  const q = query.trim();
  if (!q) {
    throw new Error("Search query must not be empty");
  }
  const clamped = Math.max(1, Math.min(50, Math.floor(limit)));
  const url =
    `${ALGOLIA_BASE}/search?query=${encodeURIComponent(q)}` +
    `&tags=story&hitsPerPage=${clamped}`;

  interface AlgoliaResponse {
    hits: Array<{
      objectID: string;
      title: string | null;
      url: string | null;
      author: string;
      points: number | null;
      num_comments: number | null;
      created_at: string;
    }>;
  }

  const data = await fetchJson<AlgoliaResponse>(url, timeoutMs);
  if (!data || !Array.isArray(data.hits)) {
    throw new Error("Unexpected response: Algolia search returned no hits array");
  }

  return data.hits.map((h) => {
    const id = Number(h.objectID);
    return {
      id,
      title: h.title ?? "(no title)",
      url: h.url ?? null,
      author: h.author,
      points: h.points ?? 0,
      numComments: h.num_comments ?? 0,
      createdAt: h.created_at,
      hnUrl: hnItemUrl(id),
    };
  });
}
