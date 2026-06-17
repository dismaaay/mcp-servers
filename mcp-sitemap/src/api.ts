// Core sitemap fetching & parsing logic.
// No MCP imports here — this module is pure and independently testable.

/** A single URL entry extracted from a <url> element in a sitemap. */
export interface SitemapUrl {
  /** The page URL (<loc>). */
  loc: string;
  /** Last modification date (<lastmod>), if present. */
  lastmod?: string;
  /** Change frequency (<changefreq>), if present. */
  changefreq?: string;
  /** Priority (<priority>), if present. */
  priority?: string;
}

/** Result of fetching & parsing a sitemap URL. */
export interface SitemapResult {
  /** The sitemap URL that was fetched. */
  sitemapUrl: string;
  /**
   * The kind of document parsed:
   * - "urlset"       a normal sitemap listing page URLs
   * - "sitemapindex" an index listing other sitemaps
   */
  kind: "urlset" | "sitemapindex";
  /** Total number of entries found in the document (before applying `limit`). */
  totalFound: number;
  /** The (possibly limited) list of URL entries. */
  urls: SitemapUrl[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-sitemap/1.0 (+https://github.com/mcp-catalog/mcp-sitemap)";

/** Decode the handful of XML entities that appear in <loc> values. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    // Ampersand must be decoded last to avoid double-decoding.
    .replace(/&amp;/g, "&");
}

/** Extract the text content of the first <tag>…</tag> within a chunk of XML. */
function firstTagText(xml: string, tag: string): string | undefined {
  // Allow optional namespace prefixes (e.g. <image:loc>) is not needed here,
  // but we tolerate attributes on the tag and surrounding whitespace.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(xml);
  if (!m) return undefined;
  const text = decodeXmlEntities(m[1].trim());
  return text.length > 0 ? text : undefined;
}

/** Validate that the input looks like an http(s) URL. */
function assertHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid sitemap_url: "${url}" is not a valid URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid sitemap_url: protocol "${parsed.protocol}" is not supported (use http or https).`,
    );
  }
  return parsed;
}

/**
 * Fetch a sitemap URL and parse it into structured entries.
 *
 * Supports both standard sitemaps (<urlset>) and sitemap indexes
 * (<sitemapindex>). Handles gzip transparently via the runtime fetch.
 *
 * @param sitemapUrl  The full URL to a sitemap.xml document.
 * @param limit       Max number of entries to return (1–50000). Defaults to 100.
 * @param timeoutMs   Network timeout in milliseconds. Defaults to 10000.
 */
export async function getUrls(
  sitemapUrl: string,
  limit = 100,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SitemapResult> {
  assertHttpUrl(sitemapUrl);

  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(50_000, Math.floor(limit)))
    : 100;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(sitemapUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/xml, text/xml, */*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Timed out fetching sitemap after ${timeoutMs}ms: ${sitemapUrl}`,
      );
    }
    throw new Error(
      `Network error fetching sitemap ${sitemapUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(
      `Sitemap request failed: HTTP ${res.status} ${res.statusText} for ${sitemapUrl}`,
    );
  }

  const xml = await res.text();
  if (!xml || xml.trim().length === 0) {
    throw new Error(`Sitemap response was empty for ${sitemapUrl}`);
  }

  // Determine document type. A sitemap index contains <sitemap> entries;
  // a normal sitemap contains <url> entries.
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isUrlset = /<urlset[\s>]/i.test(xml);

  if (!isIndex && !isUrlset) {
    // Try to be helpful: maybe we received HTML instead of XML.
    const looksHtml = /<!doctype html|<html[\s>]/i.test(xml);
    throw new Error(
      looksHtml
        ? `Expected a sitemap XML document but received HTML from ${sitemapUrl}. ` +
          `Make sure the URL points directly at a sitemap.xml file.`
        : `Could not find <urlset> or <sitemapindex> in the document at ${sitemapUrl}. ` +
          `It does not appear to be a valid sitemap.`,
    );
  }

  const kind: SitemapResult["kind"] = isIndex ? "sitemapindex" : "urlset";
  const blockTag = isIndex ? "sitemap" : "url";

  // Extract each <url>…</url> (or <sitemap>…</sitemap>) block, then pull fields.
  const blockRe = new RegExp(
    `<${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${blockTag}>`,
    "gi",
  );

  const urls: SitemapUrl[] = [];
  let totalFound = 0;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(xml)) !== null) {
    const block = match[1];
    const loc = firstTagText(block, "loc");
    if (!loc) continue; // <loc> is required; skip malformed entries.
    totalFound++;
    if (urls.length < safeLimit) {
      const entry: SitemapUrl = { loc };
      const lastmod = firstTagText(block, "lastmod");
      const changefreq = firstTagText(block, "changefreq");
      const priority = firstTagText(block, "priority");
      if (lastmod) entry.lastmod = lastmod;
      if (changefreq) entry.changefreq = changefreq;
      if (priority) entry.priority = priority;
      urls.push(entry);
    }
  }

  if (totalFound === 0) {
    throw new Error(
      `No URLs found in the ${kind} document at ${sitemapUrl}.`,
    );
  }

  return { sitemapUrl, kind, totalFound, urls };
}
