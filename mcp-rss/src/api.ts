/**
 * Core RSS / Atom feed logic. No MCP imports here — this module is pure and
 * testable on its own. Uses Node's global fetch (Node >= 18).
 *
 * The parser is intentionally dependency-free: it does a focused, forgiving
 * parse of RSS 2.0 / RSS 1.0 (RDF) <item> elements and Atom <entry> elements.
 * It is not a general-purpose XML parser, but it handles the real-world shapes
 * of the vast majority of public feeds (BBC, Reddit, GitHub, NYT, Hacker News,
 * personal blogs, etc.) including CDATA sections and HTML entities.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "mcp-rss/1.0 (+https://github.com/; Model Context Protocol feed reader)";

export interface FeedItem {
  title: string;
  link: string;
  published: string | null;
  summary: string;
  author: string | null;
  id: string | null;
}

export interface Feed {
  title: string;
  description: string;
  link: string;
  feedType: "rss" | "atom" | "unknown";
  itemCount: number;
  items: FeedItem[];
}

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

/** Fetch raw feed text with a hard timeout and clear error messages. */
async function fetchFeedText(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FeedError(`Invalid URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FeedError(
      `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new FeedError(
        `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s fetching ${url}`
      );
    }
    throw new FeedError(
      `Network error fetching ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new FeedError(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
  }

  const text = await res.text();
  if (!text.trim()) {
    throw new FeedError(`Empty response body from ${url}`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Minimal, forgiving XML helpers
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code[0] === "#") {
      const num =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      if (Number.isFinite(num)) {
        try {
          return String.fromCodePoint(num);
        } catch {
          return m;
        }
      }
      return m;
    }
    return ENTITIES[code] ?? m;
  });
}

/** Strip CDATA wrappers, decode entities, strip HTML tags, collapse whitespace. */
function cleanText(raw: string | null | undefined, stripHtml = true): string {
  if (!raw) return "";
  let s = raw;
  // Pull content out of any CDATA sections.
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (stripHtml) {
    s = s.replace(/<[^>]+>/g, " ");
  }
  s = decodeEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

/** Return inner text of the first <tag>…</tag> within `scope` (namespace-aware-ish). */
function firstTag(scope: string, tag: string): string | null {
  // Match <tag ...>...</tag> or self-closing handled separately. Allow the
  // optional "ns:" prefix to be part of the requested tag name.
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );
  const m = scope.match(re);
  return m ? m[1] : null;
}

/** Return the value of an attribute on the first matching tag. */
function firstTagAttr(
  scope: string,
  tag: string,
  attr: string
): string | null {
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "i");
  const m = scope.match(re);
  if (!m) return null;
  const attrRe = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const am = m[1].match(attrRe);
  return am ? am[1] : null;
}

/** Extract every block delimited by <tag ...> ... </tag>. */
function allBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Atom parsing
// ---------------------------------------------------------------------------

function parseAtomEntry(block: string): FeedItem {
  const title = cleanText(firstTag(block, "title"));

  // Atom links are attributes. Prefer rel="alternate" (or no rel), else first.
  let link = "";
  const linkTags = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  const candidates = linkTags.map((t) => {
    const href = t.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    const rel = t.match(/rel\s*=\s*"([^"]*)"/i)?.[1] ?? "alternate";
    return { href, rel };
  });
  link =
    candidates.find((c) => c.rel === "alternate")?.href ??
    candidates[0]?.href ??
    "";

  const published =
    firstTag(block, "published") ?? firstTag(block, "updated") ?? null;

  const summary = cleanText(
    firstTag(block, "summary") ?? firstTag(block, "content")
  );

  const authorBlock = firstTag(block, "author");
  const author = authorBlock ? cleanText(firstTag(authorBlock, "name")) : null;

  const id = cleanText(firstTag(block, "id")) || null;

  return {
    title,
    link: link.trim(),
    published: published ? cleanText(published, false) : null,
    summary,
    author: author || null,
    id,
  };
}

function parseAtom(xml: string): Feed {
  // Channel-level metadata: use the document-level title before the first entry.
  const headEnd = xml.search(/<entry[\s>]/i);
  const head = headEnd >= 0 ? xml.slice(0, headEnd) : xml;

  const title = cleanText(firstTag(head, "title"));
  const description = cleanText(
    firstTag(head, "subtitle") ?? firstTag(head, "summary")
  );
  let link = "";
  const headLinks = head.match(/<link\b[^>]*\/?>/gi) ?? [];
  for (const t of headLinks) {
    const rel = t.match(/rel\s*=\s*"([^"]*)"/i)?.[1] ?? "alternate";
    const href = t.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? "";
    if (rel === "alternate" || (!t.includes("rel=") && href)) {
      link = href;
      break;
    }
  }

  const items = allBlocks(xml, "entry").map(parseAtomEntry);

  return {
    title,
    description,
    link: link.trim(),
    feedType: "atom",
    itemCount: items.length,
    items,
  };
}

// ---------------------------------------------------------------------------
// RSS parsing (RSS 2.0 and RSS 1.0 / RDF)
// ---------------------------------------------------------------------------

function parseRssItem(block: string): FeedItem {
  const title = cleanText(firstTag(block, "title"));

  // <link> is element text in RSS. Atom-style <link href> may also appear.
  let link = cleanText(firstTag(block, "link"), false);
  if (!link) {
    link = firstTagAttr(block, "link", "href") ?? "";
  }

  const published =
    firstTag(block, "pubDate") ??
    firstTag(block, "dc:date") ??
    firstTag(block, "published") ??
    null;

  const summary = cleanText(
    firstTag(block, "description") ??
      firstTag(block, "content:encoded") ??
      firstTag(block, "summary")
  );

  const author = cleanText(
    firstTag(block, "author") ??
      firstTag(block, "dc:creator") ??
      firstTag(block, "creator") ??
      ""
  );

  const guid = cleanText(firstTag(block, "guid")) || null;

  return {
    title,
    link: link.trim(),
    published: published ? cleanText(published, false) : null,
    summary,
    author: author || null,
    id: guid,
  };
}

function parseRss(xml: string): Feed {
  // Scope channel metadata to the <channel> head (before the first item).
  const channelMatch = xml.match(/<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i);
  const channel = channelMatch ? channelMatch[1] : xml;
  const headEnd = channel.search(/<item[\s>]/i);
  const head = headEnd >= 0 ? channel.slice(0, headEnd) : channel;

  const title = cleanText(firstTag(head, "title"));
  const description = cleanText(firstTag(head, "description"));
  let link = cleanText(firstTag(head, "link"), false);
  if (!link) link = firstTagAttr(head, "link", "href") ?? "";

  const items = allBlocks(xml, "item").map(parseRssItem);

  return {
    title,
    description,
    link: link.trim(),
    feedType: "rss",
    itemCount: items.length,
    items,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a feed string (RSS 2.0, RSS 1.0/RDF, or Atom) into a Feed object. */
export function parseFeed(xml: string): Feed {
  const sample = xml.slice(0, 4000).toLowerCase();
  const isAtom =
    /<feed[\s>]/.test(sample) && sample.includes("<entry");
  const looksAtom = /<feed[\s>][^]*xmlns\s*=\s*"http:\/\/www\.w3\.org\/2005\/atom"/i.test(
    xml.slice(0, 4000)
  );

  if (isAtom || (looksAtom && !sample.includes("<rss"))) {
    const feed = parseAtom(xml);
    if (feed.items.length > 0 || feed.title) return feed;
  }

  if (/<rss[\s>]/.test(sample) || /<channel[\s>]/.test(sample) || sample.includes("<item")) {
    return parseRss(xml);
  }

  // Last-ditch: try Atom if there's a <feed>, else RSS.
  if (/<feed[\s>]/.test(sample)) return parseAtom(xml);
  if (/<item[\s>]/.test(sample)) return parseRss(xml);

  throw new FeedError(
    "Could not detect a valid RSS or Atom feed in the response. " +
      "Make sure the URL points to a feed (XML), not an HTML page."
  );
}

/**
 * Fetch and parse a feed, returning up to `limit` items.
 * @param url   RSS or Atom feed URL.
 * @param limit Max items to return (1–100, default 20).
 */
export async function getFeed(url: string, limit = 20): Promise<Feed> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  const xml = await fetchFeedText(url);
  const feed = parseFeed(xml);
  return { ...feed, items: feed.items.slice(0, safeLimit) };
}

/** Fetch a feed and return only its single most recent item. */
export async function latest(url: string): Promise<FeedItem> {
  const feed = await getFeed(url, 1);
  if (feed.items.length === 0) {
    throw new FeedError(`Feed "${feed.title || url}" contains no items.`);
  }
  return feed.items[0];
}
