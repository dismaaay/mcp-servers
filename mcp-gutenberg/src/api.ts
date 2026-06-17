/**
 * Core Gutendex API client for the Project Gutenberg MCP server.
 *
 * This module is intentionally free of any MCP SDK imports so it can be
 * unit-tested and reused independently. It talks to the public Gutendex API
 * (https://gutendex.com), a free, key-less JSON wrapper over the Project
 * Gutenberg catalog of 70,000+ public-domain ebooks.
 */

const GUTENDEX_BASE = "https://gutendex.com";

/** Descriptive User-Agent so Gutendex/Cloudflare can identify this client. */
const USER_AGENT =
  "mcp-gutenberg/1.0.0 (+https://github.com/mcp-catalog/mcp-gutenberg) Model-Context-Protocol-Server";

/** Per-request network timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/** A single author/editor/translator person record from Gutendex. */
export interface Person {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

/** A book record as returned by Gutendex. */
export interface Book {
  id: number;
  title: string;
  authors: Person[];
  summaries: string[];
  translators: Person[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
}

/** Paginated list envelope returned by Gutendex list endpoints. */
export interface BookListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Book[];
}

/** Thrown when the Gutendex API is unreachable or returns a non-OK status. */
export class GutendexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GutendexError";
  }
}

/**
 * Perform a GET request against Gutendex with a descriptive User-Agent,
 * a hard timeout, and JSON parsing. Centralizes error handling.
 */
async function gutendexFetch<T>(path: string): Promise<T> {
  const url = `${GUTENDEX_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new GutendexError(
        `Gutendex request failed: ${res.status} ${res.statusText} (${url})`
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GutendexError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GutendexError(
        `Gutendex request timed out after ${REQUEST_TIMEOUT_MS}ms (${url})`
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new GutendexError(`Gutendex request error: ${detail} (${url})`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search the Project Gutenberg catalog by author and title keywords.
 *
 * @param query    Free-text search; matched against author names and titles.
 * @param page     1-based page number (Gutendex returns 32 results per page).
 */
export async function searchBooks(
  query: string,
  page = 1
): Promise<BookListResponse> {
  const q = query.trim();
  if (!q) {
    throw new GutendexError("Search query must not be empty.");
  }
  const params = new URLSearchParams({ search: q });
  if (page && page > 1) params.set("page", String(page));
  return gutendexFetch<BookListResponse>(`/books?${params.toString()}`);
}

/**
 * Retrieve full metadata for a single book by its Project Gutenberg ID.
 *
 * @param id  Project Gutenberg book ID (e.g. 1342 = Pride and Prejudice).
 */
export async function getBook(id: number): Promise<Book> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new GutendexError(`Invalid book id: ${id}. Must be a positive integer.`);
  }
  return gutendexFetch<Book>(`/books/${id}`);
}

/**
 * List the most-downloaded books on Project Gutenberg.
 *
 * Gutendex's default ordering is by descending download count, which is the
 * canonical "popular" ranking, so we simply read the first page.
 *
 * @param limit  Maximum number of books to return (1-32). Defaults to 10.
 */
export async function popularBooks(limit = 10): Promise<Book[]> {
  const safeLimit = Math.max(1, Math.min(32, Math.trunc(limit) || 10));
  const data = await gutendexFetch<BookListResponse>(`/books`);
  return data.results.slice(0, safeLimit);
}

/** Pick a sensible reading/download URL from a book's formats map. */
export function preferredFormatUrl(book: Book): string | undefined {
  const formats = book.formats || {};
  const preferenceOrder = [
    "text/html",
    "text/plain; charset=utf-8",
    "text/plain; charset=us-ascii",
    "text/plain",
    "application/epub+zip",
  ];
  for (const key of preferenceOrder) {
    if (formats[key]) return formats[key];
  }
  // Fall back to the first non-RDF/image format if none of the above matched.
  const entries = Object.entries(formats).filter(
    ([k]) => !k.includes("rdf") && !k.startsWith("image/")
  );
  return entries.length ? entries[0][1] : undefined;
}

/** Render a compact one-line summary of a book for tool text output. */
export function formatBookLine(book: Book): string {
  const author =
    book.authors && book.authors.length
      ? book.authors.map((a) => a.name).join(", ")
      : "Unknown author";
  const langs = book.languages?.length ? ` [${book.languages.join(", ")}]` : "";
  return `#${book.id} — ${book.title} — ${author}${langs} (${book.download_count.toLocaleString()} downloads)`;
}
