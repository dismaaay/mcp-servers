/**
 * Core arXiv API client.
 *
 * This module deliberately contains NO Model Context Protocol imports so that it
 * can be unit-tested and reused independently of the MCP server. It talks to the
 * public arXiv Atom API (https://export.arxiv.org/api/query), which requires no
 * API key.
 *
 * All logging in this project goes to stderr; this module logs nothing itself and
 * instead throws descriptive errors for the caller to surface.
 */

const ARXIV_API_BASE = "https://export.arxiv.org/api/query";
const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-arxiv/1.0.0 (+https://github.com/) Model Context Protocol server";

/** A single arXiv paper, normalised from the Atom feed. */
export interface ArxivPaper {
  /** Bare arXiv id including version, e.g. "1706.03762v7". */
  id: string;
  /** Bare arXiv id without version, e.g. "1706.03762". */
  shortId: string;
  title: string;
  summary: string;
  authors: string[];
  /** ISO timestamp of first publication. */
  published: string;
  /** ISO timestamp of last update. */
  updated: string;
  /** arXiv category tags, e.g. ["cs.CL", "cs.LG"]. */
  categories: string[];
  /** Primary category tag, if present. */
  primaryCategory?: string;
  /** Author / journal comment, if present. */
  comment?: string;
  /** DOI, if present. */
  doi?: string;
  /** Canonical abstract page URL. */
  absUrl: string;
  /** Direct PDF URL, if present. */
  pdfUrl?: string;
}

/** Thrown for any recoverable failure talking to arXiv. */
export class ArxivApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArxivApiError";
  }
}

/**
 * Fetch a URL with a hard timeout (default 10s) and a descriptive User-Agent.
 * Uses Node 20+ global fetch + AbortController.
 */
async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
    });
    // arXiv returns 400 with an Atom error feed for bad ids; we still want to
    // read the body in that case to surface the human-readable message, so only
    // hard-fail on 5xx / unexpected non-Atom statuses.
    const body = await res.text();
    if (!res.ok && res.status >= 500) {
      throw new ArxivApiError(`arXiv API returned HTTP ${res.status} ${res.statusText}.`);
    }
    return body;
  } catch (err) {
    if (err instanceof ArxivApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ArxivApiError(`arXiv API request timed out after ${timeoutMs}ms.`);
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new ArxivApiError(`Failed to reach arXiv API: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

// --- Minimal, dependency-free Atom XML parsing -----------------------------
// The arXiv feed is small and well-formed Atom XML. Rather than pull in a
// heavyweight XML library we extract the handful of fields we need with focused
// regexes plus entity decoding. This keeps the dependency surface to just the
// MCP SDK + zod.

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&"); // must run last
}

/** Collapse internal whitespace/newlines from Atom text nodes. */
function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

function firstMatch(block: string, re: RegExp): string | undefined {
  const m = block.match(re);
  return m ? m[1] : undefined;
}

function allMatches(block: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(block)) !== null) out.push(m[1]);
  return out;
}

/** Split a feed into its <entry>...</entry> blocks. */
function extractEntries(xml: string): string[] {
  return allMatches(xml, /<entry\b[^>]*>([\s\S]*?)<\/entry>/);
}

/**
 * arXiv signals errors (e.g. malformed id) via a single <entry> whose id points
 * at https://arxiv.org/api/errors#... and whose <summary> is the message.
 */
function entryError(entry: string): string | undefined {
  const id = firstMatch(entry, /<id>([\s\S]*?)<\/id>/);
  if (id && id.includes("/api/errors")) {
    return clean(firstMatch(entry, /<summary>([\s\S]*?)<\/summary>/) ?? "Unknown arXiv API error.");
  }
  return undefined;
}

function parseEntry(entry: string): ArxivPaper {
  const idUrl = clean(firstMatch(entry, /<id>([\s\S]*?)<\/id>/) ?? "");
  // idUrl looks like http://arxiv.org/abs/1706.03762v7
  const idWithVersion = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
  const shortId = idWithVersion.replace(/v\d+$/, "");

  const authors = allMatches(entry, /<author>\s*<name>([\s\S]*?)<\/name>/).map(clean);
  const categories = allMatches(entry, /<category\b[^>]*\bterm="([^"]+)"/);
  const primaryCategory = firstMatch(entry, /<arxiv:primary_category\b[^>]*\bterm="([^"]+)"/);
  const comment = firstMatch(entry, /<arxiv:comment>([\s\S]*?)<\/arxiv:comment>/);
  const doi = firstMatch(entry, /<arxiv:doi>([\s\S]*?)<\/arxiv:doi>/);

  // Links: rel="alternate" is the abs page, rel="related" title="pdf" is the PDF.
  const links = allMatches(entry, /<link\b([^>]*)\/?>/);
  let absUrl = idUrl.replace(/^http:/, "https:");
  let pdfUrl: string | undefined;
  for (const attrs of links) {
    const href = firstMatch(attrs, /\bhref="([^"]+)"/);
    if (!href) continue;
    if (/rel="alternate"/.test(attrs) && /type="text\/html"/.test(attrs)) absUrl = href;
    if (/title="pdf"/.test(attrs) || /type="application\/pdf"/.test(attrs)) pdfUrl = href;
  }

  return {
    id: idWithVersion,
    shortId,
    title: clean(firstMatch(entry, /<title>([\s\S]*?)<\/title>/) ?? "(untitled)"),
    summary: clean(firstMatch(entry, /<summary>([\s\S]*?)<\/summary>/) ?? ""),
    authors,
    published: clean(firstMatch(entry, /<published>([\s\S]*?)<\/published>/) ?? ""),
    updated: clean(firstMatch(entry, /<updated>([\s\S]*?)<\/updated>/) ?? ""),
    categories,
    primaryCategory: primaryCategory ? clean(primaryCategory) : undefined,
    comment: comment ? clean(comment) : undefined,
    doi: doi ? clean(doi) : undefined,
    absUrl: clean(absUrl),
    pdfUrl: pdfUrl ? clean(pdfUrl) : undefined,
  };
}

function parseFeed(xml: string): ArxivPaper[] {
  const entries = extractEntries(xml);
  // If the only entry is an error entry, raise it.
  if (entries.length === 1) {
    const err = entryError(entries[0]);
    if (err) throw new ArxivApiError(`arXiv API error: ${err}`);
  }
  return entries
    .filter((e) => !entryError(e))
    .map(parseEntry);
}

// --- Public API ------------------------------------------------------------

export interface SearchOptions {
  /** Number of results to return (1-50). */
  maxResults?: number;
  timeoutMs?: number;
}

/**
 * Search arXiv across all fields.
 *
 * @param query free-text query, e.g. "quantum error correction"
 */
export async function searchPapers(query: string, opts: SearchOptions = {}): Promise<ArxivPaper[]> {
  const trimmed = query.trim();
  if (!trimmed) throw new ArxivApiError("Search query must not be empty.");

  const max = Math.min(Math.max(opts.maxResults ?? 10, 1), 50);
  const params = new URLSearchParams({
    search_query: `all:${trimmed}`,
    start: "0",
    max_results: String(max),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const xml = await fetchText(`${ARXIV_API_BASE}?${params.toString()}`, opts.timeoutMs);
  return parseFeed(xml);
}

/** Normalise user-supplied arXiv ids (strip URL prefixes, "arXiv:" prefix). */
export function normalizeArxivId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/\.pdf$/i, "")
    .replace(/^arxiv:/i, "");
}

/**
 * Fetch a single paper by its arXiv id (e.g. "1706.03762" or "cond-mat/0011267").
 */
export async function getPaper(arxivId: string, opts: { timeoutMs?: number } = {}): Promise<ArxivPaper> {
  const id = normalizeArxivId(arxivId);
  if (!id) throw new ArxivApiError("arXiv id must not be empty.");

  const params = new URLSearchParams({ id_list: id, max_results: "1" });
  const xml = await fetchText(`${ARXIV_API_BASE}?${params.toString()}`, opts.timeoutMs);
  const papers = parseFeed(xml);
  if (papers.length === 0) {
    throw new ArxivApiError(`No paper found for arXiv id "${id}".`);
  }
  return papers[0];
}

// --- Text formatting (shared by the MCP layer and CLI/tests) ---------------

/** Format a list of papers as a compact, readable search-results listing. */
export function formatSearchResults(query: string, papers: ArxivPaper[]): string {
  if (papers.length === 0) {
    return `No arXiv papers found for "${query}".`;
  }
  const header = `Found ${papers.length} arXiv paper${papers.length === 1 ? "" : "s"} for "${query}":\n`;
  const items = papers.map((p, i) => {
    const authors =
      p.authors.length > 3
        ? `${p.authors.slice(0, 3).join(", ")}, et al.`
        : p.authors.join(", ");
    const year = p.published ? p.published.slice(0, 4) : "n/a";
    return [
      `${i + 1}. ${p.title}`,
      `   arXiv:${p.shortId}  (${year})  [${p.categories.join(", ")}]`,
      `   Authors: ${authors || "n/a"}`,
      `   ${p.absUrl}`,
    ].join("\n");
  });
  return header + "\n" + items.join("\n\n");
}

/** Format a single paper with its full abstract and metadata. */
export function formatPaperDetail(p: ArxivPaper): string {
  const lines = [
    p.title,
    "=".repeat(Math.min(p.title.length, 80)),
    `arXiv id:   ${p.id}`,
    `Authors:    ${p.authors.join(", ") || "n/a"}`,
    `Published:  ${p.published || "n/a"}`,
    `Updated:    ${p.updated || "n/a"}`,
    `Categories: ${p.categories.join(", ") || "n/a"}${
      p.primaryCategory ? ` (primary: ${p.primaryCategory})` : ""
    }`,
  ];
  if (p.doi) lines.push(`DOI:        ${p.doi}`);
  if (p.comment) lines.push(`Comment:    ${p.comment}`);
  lines.push(`Abstract:   ${p.absUrl}`);
  if (p.pdfUrl) lines.push(`PDF:        ${p.pdfUrl}`);
  lines.push("", "Abstract", "--------", p.summary || "(no abstract available)");
  return lines.join("\n");
}
