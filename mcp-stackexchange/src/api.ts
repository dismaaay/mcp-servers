/**
 * Stack Exchange API 2.3 client.
 *
 * Pure data-access layer — contains NO MCP imports so it can be reused and
 * unit-tested independently of the protocol server. Uses Node's global fetch
 * with a hard 10s timeout and surfaces clear, actionable error messages.
 *
 * Docs: https://api.stackexchange.com/docs
 */

const API_BASE = "https://api.stackexchange.com/2.3";
const SITE = "stackoverflow";
const REQUEST_TIMEOUT_MS = 10_000;

/** A single question returned by the search endpoint. */
export interface Question {
  question_id: number;
  title: string;
  link: string;
  score: number;
  answer_count: number;
  is_answered: boolean;
  view_count: number;
  tags: string[];
  accepted_answer_id?: number;
  creation_date: number;
  last_activity_date: number;
  owner_name?: string;
}

/** A single answer returned by the answers endpoint. */
export interface Answer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body_markdown?: string;
  body?: string;
  creation_date: number;
  owner_name?: string;
}

/** Shape of the Stack Exchange "common wrapper" object. */
interface SeWrapper<T> {
  items: T[];
  has_more: boolean;
  quota_max?: number;
  quota_remaining?: number;
  error_id?: number;
  error_name?: string;
  error_message?: string;
}

/**
 * Perform a GET against the Stack Exchange API and return the parsed wrapper.
 * Handles timeouts, network errors, non-2xx responses, and API-level errors
 * (which are returned with HTTP 400 + an error_message body).
 */
async function seFetch<T>(path: string, params: Record<string, string>): Promise<SeWrapper<T>> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("site", SITE);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Stack Exchange request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw new Error(`Network error contacting Stack Exchange: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  let data: SeWrapper<T>;
  try {
    data = (await res.json()) as SeWrapper<T>;
  } catch {
    throw new Error(`Stack Exchange returned an unparseable response (HTTP ${res.status})`);
  }

  // The API reports application errors via error_message even on non-2xx.
  if (data.error_message) {
    throw new Error(`Stack Exchange API error (${data.error_name ?? data.error_id}): ${data.error_message}`);
  }
  if (!res.ok) {
    throw new Error(`Stack Exchange API returned HTTP ${res.status}`);
  }

  if (typeof data.quota_remaining === "number" && data.quota_remaining <= 5) {
    console.error(`[mcp-stackexchange] WARNING: low API quota remaining: ${data.quota_remaining}`);
  }

  return data;
}

/** Raw item shapes from the API (subset of fields we map). */
interface RawQuestion {
  question_id: number;
  title: string;
  link: string;
  score: number;
  answer_count: number;
  is_answered: boolean;
  view_count: number;
  tags: string[];
  accepted_answer_id?: number;
  creation_date: number;
  last_activity_date: number;
  owner?: { display_name?: string };
}

interface RawAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  body_markdown?: string;
  body?: string;
  creation_date: number;
  owner?: { display_name?: string };
}

/**
 * Search Stack Overflow questions by free-text query, sorted by relevance.
 *
 * @param query   Free-text search terms (required, non-empty).
 * @param pageSize Number of results to return (1-50, default 10).
 */
export async function searchQuestions(query: string, pageSize = 10): Promise<Question[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("query must be a non-empty string");
  }
  const size = Math.min(Math.max(pageSize, 1), 50);

  const data = await seFetch<RawQuestion>("/search/advanced", {
    order: "desc",
    sort: "relevance",
    q: trimmed,
    pagesize: String(size),
    filter: "default",
  });

  return data.items.map((q) => ({
    question_id: q.question_id,
    title: decodeEntities(q.title),
    link: q.link,
    score: q.score,
    answer_count: q.answer_count,
    is_answered: q.is_answered,
    view_count: q.view_count,
    tags: q.tags ?? [],
    accepted_answer_id: q.accepted_answer_id,
    creation_date: q.creation_date,
    last_activity_date: q.last_activity_date,
    owner_name: q.owner?.display_name,
  }));
}

/**
 * Fetch answers for a given question id, sorted by votes (highest first).
 * Includes the rendered answer body as Markdown.
 *
 * @param questionId Stack Overflow question id (positive integer).
 * @param pageSize   Number of answers to return (1-30, default 10).
 */
export async function getAnswers(questionId: number, pageSize = 10): Promise<Answer[]> {
  if (!Number.isInteger(questionId) || questionId <= 0) {
    throw new Error("question_id must be a positive integer");
  }
  const size = Math.min(Math.max(pageSize, 1), 30);

  const data = await seFetch<RawAnswer>(`/questions/${questionId}/answers`, {
    order: "desc",
    sort: "votes",
    pagesize: String(size),
    // withbody includes the HTML body; we also request markdown via a custom filter fallback.
    filter: "withbody",
  });

  return data.items.map((a) => ({
    answer_id: a.answer_id,
    question_id: a.question_id,
    score: a.score,
    is_accepted: a.is_accepted,
    body_markdown: a.body_markdown,
    body: a.body ? stripHtml(a.body) : undefined,
    creation_date: a.creation_date,
    owner_name: a.owner?.display_name,
  }));
}

/** Minimal HTML-entity decoder for titles (API HTML-encodes them). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Convert answer HTML body to readable plain text. */
function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => `\n${code}\n`)
      .replace(/<\/(p|div|li|h[1-6]|pre|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
