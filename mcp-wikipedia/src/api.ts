/**
 * Core Wikipedia API client.
 *
 * This module deliberately has NO dependency on the MCP SDK so that the fetch
 * logic can be unit-tested in isolation. All functions hit the live public
 * Wikipedia APIs:
 *   - Action API:   https://en.wikipedia.org/w/api.php
 *   - REST v1 API:  https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *
 * No API key is required. A descriptive User-Agent is sent per the Wikimedia
 * API etiquette guidelines.
 */

const DEFAULT_LANG = process.env.WIKIPEDIA_LANG?.trim() || "en";
const USER_AGENT =
  process.env.WIKIPEDIA_USER_AGENT?.trim() ||
  "mcp-wikipedia/1.0 (https://github.com/mcp-catalog/mcp-wikipedia)";
const REQUEST_TIMEOUT_MS = 10_000;

function actionApiBase(lang: string): string {
  return `https://${lang}.wikipedia.org/w/api.php`;
}

function restApiBase(lang: string): string {
  return `https://${lang}.wikipedia.org/api/rest_v1`;
}

/** Error thrown for any failure talking to Wikipedia (network, timeout, HTTP, not-found). */
export class WikipediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikipediaError";
  }
}

/**
 * fetch wrapper with a hard 10s timeout and consistent error handling.
 * Returns the parsed JSON body, or throws WikipediaError.
 */
async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new WikipediaError(
        `Request to Wikipedia timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      );
    }
    throw new WikipediaError(
      `Network error contacting Wikipedia: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    // REST summary endpoint returns 404 for unknown titles.
    throw new WikipediaError("PAGE_NOT_FOUND");
  }
  if (!res.ok) {
    throw new WikipediaError(
      `Wikipedia returned HTTP ${res.status} ${res.statusText}`
    );
  }

  try {
    return await res.json();
  } catch (err) {
    throw new WikipediaError(
      `Failed to parse Wikipedia response as JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

export interface SearchResult {
  title: string;
  pageid: number;
  /** Plain-text snippet (HTML stripped) describing the match. */
  snippet: string;
  wordcount: number;
  url: string;
}

export interface PageSummary {
  title: string;
  description: string | null;
  extract: string;
  url: string;
  thumbnail: string | null;
}

export interface PageExtract {
  title: string;
  extract: string;
  url: string;
  pageid: number;
}

/** Strip HTML tags and decode the handful of entities the search API emits. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * Full-text search of Wikipedia article titles + content.
 * @param query free-text query
 * @param limit max results (1-50, clamped)
 * @param lang  wiki language code (defaults to env WIKIPEDIA_LANG or "en")
 */
export async function search(
  query: string,
  limit = 5,
  lang: string = DEFAULT_LANG
): Promise<SearchResult[]> {
  const clamped = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(clamped),
    format: "json",
    utf8: "1",
    formatversion: "2",
  });
  const url = `${actionApiBase(lang)}?${params.toString()}`;
  const data = await fetchJson(url);

  if (data?.error) {
    throw new WikipediaError(
      `Wikipedia API error: ${data.error.info ?? data.error.code ?? "unknown"}`
    );
  }

  const hits: any[] = data?.query?.search ?? [];
  return hits.map((h) => ({
    title: h.title,
    pageid: h.pageid,
    snippet: stripHtml(h.snippet ?? ""),
    wordcount: h.wordcount ?? 0,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
      String(h.title).replace(/ /g, "_")
    )}`,
  }));
}

/**
 * Short summary of an article via the REST v1 summary endpoint.
 * Follows redirects automatically. Throws WikipediaError("PAGE_NOT_FOUND")
 * when the title does not resolve.
 */
export async function getSummary(
  title: string,
  lang: string = DEFAULT_LANG
): Promise<PageSummary> {
  const encoded = encodeURIComponent(title.trim().replace(/ /g, "_"));
  const url = `${restApiBase(lang)}/page/summary/${encoded}?redirect=true`;
  const data = await fetchJson(url);

  if (data?.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") {
    throw new WikipediaError("PAGE_NOT_FOUND");
  }

  return {
    title: data.title ?? title,
    description: data.description ?? null,
    extract: data.extract ?? "",
    url:
      data?.content_urls?.desktop?.page ??
      `https://${lang}.wikipedia.org/wiki/${encoded}`,
    thumbnail: data?.thumbnail?.source ?? null,
  };
}

/**
 * Full plain-text extract (lead + body) of an article via the Action API
 * extracts prop. Follows redirects. Throws WikipediaError("PAGE_NOT_FOUND")
 * when the title is missing.
 */
export async function getPageExtract(
  title: string,
  lang: string = DEFAULT_LANG
): Promise<PageExtract> {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    titles: title.trim(),
    format: "json",
    redirects: "1",
    formatversion: "2",
  });
  const url = `${actionApiBase(lang)}?${params.toString()}`;
  const data = await fetchJson(url);

  if (data?.error) {
    throw new WikipediaError(
      `Wikipedia API error: ${data.error.info ?? data.error.code ?? "unknown"}`
    );
  }

  const pages: any[] = data?.query?.pages ?? [];
  const page = pages[0];
  if (!page || page.missing || page.invalid) {
    throw new WikipediaError("PAGE_NOT_FOUND");
  }

  return {
    title: page.title,
    extract: page.extract ?? "",
    pageid: page.pageid,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
      String(page.title).replace(/ /g, "_")
    )}`,
  };
}
