/**
 * Core URL metadata extraction logic.
 *
 * Intentionally has NO dependency on the MCP SDK so it can be unit-tested and
 * reused independently. Uses Node's global `fetch` (Node >= 18) with a hard
 * timeout, and a small dependency-free HTML parser tuned for <head> metadata.
 *
 * All diagnostic logging by callers should go to stderr only; this module
 * does not log at all.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // 2 MB cap so we never buffer giant responses
const USER_AGENT =
  "mcp-url-metadata/1.0 (+https://github.com/; like Mozilla/5.0)";

export interface UrlMetadata {
  /** The URL that was actually fetched (after redirects). */
  url: string;
  /** Final HTTP status code of the fetched document. */
  status: number;
  /** Content-Type header reported by the server, if any. */
  contentType: string | null;
  /** <title> text, if present. */
  title: string | null;
  /** <meta name="description"> content, if present. */
  description: string | null;
  /** Canonical <link rel="canonical"> href, if present. */
  canonical: string | null;
  /** All OpenGraph (og:*) properties, keyed without the "og:" prefix. */
  openGraph: Record<string, string>;
  /** All Twitter card (twitter:*) properties, keyed without the prefix. */
  twitter: Record<string, string>;
  /** Convenience: best-guess preview image (og:image -> twitter:image). */
  image: string | null;
  /** Convenience: best-guess site name (og:site_name). */
  siteName: string | null;
}

export class UrlMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlMetadataError";
  }
}

/**
 * Validate and normalize a user-supplied URL string.
 * Throws UrlMetadataError with a clear message on bad input.
 */
export function normalizeUrl(raw: string): URL {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    throw new UrlMetadataError("URL is empty. Provide an http(s) URL.");
  }

  // Be forgiving: if the user omitted the scheme, assume https.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UrlMetadataError(`Invalid URL: ${JSON.stringify(raw)}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlMetadataError(
      `Unsupported URL scheme "${parsed.protocol}". Only http and https are supported.`,
    );
  }

  return parsed;
}

/** Decode the most common HTML entities found in metadata text. */
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      safeFromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)));
}

function safeFromCodePoint(code: number): string {
  try {
    if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
      return String.fromCodePoint(code);
    }
  } catch {
    /* fall through */
  }
  return "";
}

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const out = decodeEntities(value).replace(/\s+/g, " ").trim();
  return out.length ? out : null;
}

/**
 * Extract the value of a given attribute from a raw HTML tag string.
 * Handles single quotes, double quotes, and unquoted values.
 */
function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(
    `${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "i",
  );
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/**
 * Parse the metadata we care about out of an HTML document string.
 * Pure function — exported so it can be tested without any network access.
 */
export function parseMetadata(html: string): {
  title: string | null;
  description: string | null;
  canonical: string | null;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
} {
  // Limit parsing to the <head> when possible to avoid scanning huge bodies.
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const scope = headMatch ? headMatch[0] : html;

  // <title>
  const titleMatch = scope.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? clean(titleMatch[1]) : null;

  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  let description: string | null = null;

  const metaTags = scope.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const content = getAttr(tag, "content");
    if (content == null) continue;
    const value = clean(content);
    if (value == null) continue;

    // OpenGraph and many social tags use `property=`; standard meta uses `name=`.
    const property = getAttr(tag, "property")?.toLowerCase();
    const name = getAttr(tag, "name")?.toLowerCase();
    const key = property ?? name;
    if (!key) continue;

    if (key === "description" && description == null) {
      description = value;
    } else if (key.startsWith("og:")) {
      const k = key.slice(3);
      if (k && openGraph[k] === undefined) openGraph[k] = value;
    } else if (key.startsWith("twitter:")) {
      const k = key.slice(8);
      if (k && twitter[k] === undefined) twitter[k] = value;
    }
  }

  // <link rel="canonical" href="...">
  let canonical: string | null = null;
  const linkTags = scope.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = getAttr(tag, "rel")?.toLowerCase();
    if (rel === "canonical") {
      canonical = clean(getAttr(tag, "href"));
      if (canonical) break;
    }
  }

  return { title, description, canonical, openGraph, twitter };
}

/** Read a fetch Response body as text, enforcing a byte cap. */
async function readBodyCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    return await res.text();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c.subarray(0, Math.min(c.byteLength, total - offset)), offset);
    offset += c.byteLength;
    if (offset >= total) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

export interface FetchOptions {
  timeoutMs?: number;
}

/**
 * Fetch a URL and extract its metadata. The main entry point used by the MCP
 * tool. Throws UrlMetadataError with human-friendly messages on failure.
 */
export async function getMetadata(
  rawUrl: string,
  opts: FetchOptions = {},
): Promise<UrlMetadata> {
  const url = normalizeUrl(rawUrl);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UrlMetadataError(
        `Request timed out after ${timeoutMs}ms while fetching ${url.toString()}`,
      );
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new UrlMetadataError(`Failed to fetch ${url.toString()}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get("content-type");

  if (!res.ok) {
    // Drain the body so the socket can be reused/closed cleanly.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    throw new UrlMetadataError(
      `Server returned HTTP ${res.status} ${res.statusText} for ${res.url || url.toString()}`,
    );
  }

  // If it's clearly not an HTML/XML document, we can't extract page metadata.
  if (
    contentType &&
    !/(text\/html|application\/xhtml\+xml|text\/xml|application\/xml|^text\/plain)/i.test(
      contentType,
    )
  ) {
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    throw new UrlMetadataError(
      `URL is not an HTML page (Content-Type: ${contentType}). Cannot extract page metadata.`,
    );
  }

  let html: string;
  try {
    html = await readBodyCapped(res);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UrlMetadataError(
      `Failed to read response body from ${res.url || url.toString()}: ${reason}`,
    );
  }

  const parsed = parseMetadata(html);

  const image = parsed.openGraph.image ?? parsed.twitter.image ?? null;
  const siteName = parsed.openGraph.site_name ?? null;

  return {
    url: res.url || url.toString(),
    status: res.status,
    contentType,
    title: parsed.title,
    description: parsed.description,
    canonical: parsed.canonical,
    openGraph: parsed.openGraph,
    twitter: parsed.twitter,
    image,
    siteName,
  };
}
