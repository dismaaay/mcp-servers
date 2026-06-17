/**
 * Open Library API client.
 *
 * Pure data-fetching layer with NO MCP imports so it can be unit/smoke tested
 * in isolation. All network access goes through `fetchJson`, which enforces a
 * request timeout and surfaces clear, actionable errors.
 *
 * Open Library docs: https://openlibrary.org/developers/api
 */

const BASE_URL = "https://openlibrary.org";
const USER_AGENT =
  "mcp-open-library/1.0.0 (https://github.com/; MCP server for Open Library)";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Error type that carries enough context to render a helpful message. */
export class OpenLibraryError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenLibraryError";
  }
}

/**
 * Fetch JSON from a URL with a hard timeout and consistent error handling.
 * Follows redirects (the Open Library /isbn and /authors endpoints redirect).
 */
async function fetchJson<T>(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OpenLibraryError(
        `Open Library returned HTTP ${res.status} ${res.statusText} for ${url}`,
        res.status,
      );
    }
    const text = await res.text();
    if (!text.trim()) {
      throw new OpenLibraryError(`Open Library returned an empty body for ${url}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OpenLibraryError(
        `Open Library returned a non-JSON response for ${url}`,
      );
    }
  } catch (err) {
    if (err instanceof OpenLibraryError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenLibraryError(
        `Request to Open Library timed out after ${timeoutMs}ms (${url})`,
      );
    }
    throw new OpenLibraryError(
      `Network error contacting Open Library: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- search_books ----------------------------- */

export interface BookSearchResult {
  title: string;
  authors: string[];
  firstPublishYear?: number;
  editionCount?: number;
  workKey?: string;
  coverUrl?: string;
}

export interface BookSearchResponse {
  totalFound: number;
  results: BookSearchResult[];
}

interface RawSearchDoc {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  edition_count?: number;
  key?: string;
  cover_i?: number;
}

interface RawSearchResponse {
  numFound?: number;
  num_found?: number;
  docs?: RawSearchDoc[];
}

export async function searchBooks(
  query: string,
  limit = 10,
): Promise<BookSearchResponse> {
  const q = query.trim();
  if (!q) throw new OpenLibraryError("Search query must not be empty.");
  const clampedLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  const url =
    `${BASE_URL}/search.json?q=${encodeURIComponent(q)}` +
    `&limit=${clampedLimit}` +
    `&fields=title,author_name,first_publish_year,edition_count,key,cover_i`;

  const data = await fetchJson<RawSearchResponse>(url);
  const docs = data.docs ?? [];

  const results: BookSearchResult[] = docs.map((d) => ({
    title: d.title ?? "(untitled)",
    authors: d.author_name ?? [],
    firstPublishYear: d.first_publish_year,
    editionCount: d.edition_count,
    workKey: d.key,
    coverUrl:
      d.cover_i != null
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
        : undefined,
  }));

  return {
    totalFound: data.numFound ?? data.num_found ?? results.length,
    results,
  };
}

/* ------------------------------- get_book ------------------------------- */

export interface BookDetails {
  isbn: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publishers: string[];
  publishDate?: string;
  numberOfPages?: number;
  pagination?: string;
  subjects: string[];
  openLibraryUrl?: string;
  coverUrl?: string;
}

interface RawBooksApiEntry {
  url?: string;
  title?: string;
  subtitle?: string;
  authors?: { name?: string; url?: string }[];
  publishers?: { name?: string }[];
  publish_date?: string;
  number_of_pages?: number;
  pagination?: string;
  subjects?: { name?: string; url?: string }[];
  cover?: { small?: string; medium?: string; large?: string };
}

/** Normalize an ISBN: strip spaces/hyphens, uppercase the trailing X. */
function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[\s-]/g, "").toUpperCase();
}

export async function getBook(isbn: string): Promise<BookDetails> {
  const clean = normalizeIsbn(isbn);
  if (!/^(\d{9}[\dX]|\d{13})$/.test(clean)) {
    throw new OpenLibraryError(
      `"${isbn}" does not look like a valid ISBN-10 or ISBN-13.`,
    );
  }

  // The Books API (jscmd=data) returns a clean, normalized object and follows
  // edition/work relations for us — better than the raw /isbn/<isbn>.json doc.
  const url =
    `${BASE_URL}/api/books?bibkeys=ISBN:${encodeURIComponent(clean)}` +
    `&jscmd=data&format=json`;

  const data = await fetchJson<Record<string, RawBooksApiEntry>>(url);
  const entry = data[`ISBN:${clean}`];
  if (!entry) {
    throw new OpenLibraryError(
      `No book found in Open Library for ISBN ${clean}.`,
    );
  }

  return {
    isbn: clean,
    title: entry.title ?? "(untitled)",
    subtitle: entry.subtitle,
    authors: (entry.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
    publishers: (entry.publishers ?? []).map((p) => p.name ?? "").filter(Boolean),
    publishDate: entry.publish_date,
    numberOfPages: entry.number_of_pages,
    pagination: entry.pagination,
    subjects: (entry.subjects ?? []).map((s) => s.name ?? "").filter(Boolean),
    openLibraryUrl: entry.url,
    coverUrl: entry.cover?.medium ?? entry.cover?.large ?? entry.cover?.small,
  };
}

/* ----------------------------- author_works ----------------------------- */

export interface AuthorWork {
  title: string;
  workKey?: string;
  firstPublishDate?: string;
}

export interface AuthorWorksResponse {
  authorName: string;
  authorKey: string;
  totalWorks: number;
  works: AuthorWork[];
}

interface RawAuthorDoc {
  key?: string; // e.g. "OL26320A"
  name?: string;
  work_count?: number;
}

interface RawAuthorSearch {
  docs?: RawAuthorDoc[];
}

interface RawWorkEntry {
  title?: string;
  key?: string;
  first_publish_date?: string;
}

interface RawWorksResponse {
  size?: number;
  entries?: RawWorkEntry[];
}

export async function authorWorks(
  author: string,
  limit = 10,
): Promise<AuthorWorksResponse> {
  const name = author.trim();
  if (!name) throw new OpenLibraryError("Author name must not be empty.");
  const clampedLimit = Math.max(1, Math.min(50, Math.floor(limit)));

  // 1) Resolve the author name to an Open Library author key.
  const searchUrl = `${BASE_URL}/search/authors.json?q=${encodeURIComponent(
    name,
  )}`;
  const search = await fetchJson<RawAuthorSearch>(searchUrl);
  const candidates = (search.docs ?? []).filter((d) => d.key);
  if (candidates.length === 0) {
    throw new OpenLibraryError(`No author found matching "${name}".`);
  }

  // Prefer an exact (case-insensitive) name match; otherwise fall back to the
  // top-ranked result (Open Library already ranks by relevance/popularity).
  const lower = name.toLowerCase();
  const best =
    candidates.find((d) => (d.name ?? "").toLowerCase() === lower) ??
    candidates[0];
  const authorKey = best.key!;

  // 2) Fetch that author's works.
  const worksUrl = `${BASE_URL}/authors/${encodeURIComponent(
    authorKey,
  )}/works.json?limit=${clampedLimit}`;
  const worksData = await fetchJson<RawWorksResponse>(worksUrl);
  const entries = worksData.entries ?? [];

  return {
    authorName: best.name ?? name,
    authorKey,
    totalWorks: worksData.size ?? entries.length,
    works: entries.map((e) => ({
      title: e.title ?? "(untitled)",
      workKey: e.key,
      firstPublishDate: e.first_publish_date,
    })),
  };
}
