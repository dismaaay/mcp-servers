/**
 * Core logic for talking to the Internet Archive Wayback Machine.
 *
 * This module is intentionally free of any MCP / SDK imports so it can be
 * unit-tested or reused independently. It only uses the Node global `fetch`.
 *
 * Two public, key-less endpoints are wrapped:
 *   - https://archive.org/wayback/available  (closest-snapshot lookup)
 *   - https://web.archive.org/cdx/search/cdx (capture index / list)
 */

const USER_AGENT =
  "mcp-wayback/1.0.0 (+https://github.com/modelcontextprotocol; Wayback Machine MCP server)";

const DEFAULT_TIMEOUT_MS = 10_000;

/** A single archived snapshot of a URL. */
export interface Snapshot {
  /** The original URL that was captured. */
  url: string;
  /** Direct link to the archived copy on web.archive.org. */
  archivedUrl: string;
  /** 14-digit capture timestamp, e.g. "20100102003410" (UTC, yyyyMMddHHmmss). */
  timestamp: string;
  /** Human-readable ISO 8601 form of the timestamp. */
  isoDate: string;
  /** HTTP status code recorded at capture time (e.g. "200", "404"). */
  status: string;
  /** MIME type of the captured resource, when available. */
  mimetype?: string;
}

/** Raw shape returned by the `wayback/available` endpoint. */
interface AvailableResponse {
  url?: string;
  archived_snapshots?: {
    closest?: {
      status?: string;
      available?: boolean;
      url?: string;
      timestamp?: string;
    };
  };
}

/**
 * Perform a fetch with a hard timeout and a descriptive User-Agent.
 * Throws a clear Error on non-2xx responses or timeouts.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `Wayback API returned HTTP ${res.status} ${res.statusText} for ${url}`,
      );
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Wayback API request timed out after ${timeoutMs}ms: ${url}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Convert a 14-digit Wayback timestamp into an ISO 8601 string. */
export function timestampToIso(ts: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  if (!m) return ts;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/** Normalize / validate the optional timestamp argument. */
function normalizeTimestamp(timestamp?: string): string | undefined {
  if (!timestamp) return undefined;
  const digits = timestamp.replace(/\D/g, "");
  if (digits.length === 0) return undefined;
  if (digits.length > 14) {
    throw new Error(
      `timestamp must be a date in the form yyyyMMddHHmmss (up to 14 digits), got "${timestamp}"`,
    );
  }
  return digits;
}

/**
 * Look up the snapshot of `url` closest to `timestamp` (or the most relevant
 * snapshot if no timestamp is given) using the `wayback/available` endpoint.
 *
 * Returns `null` when the URL has never been archived.
 */
export async function getSnapshot(
  url: string,
  timestamp?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Snapshot | null> {
  if (!url || url.trim().length === 0) {
    throw new Error("url is required and must be a non-empty string");
  }

  const params = new URLSearchParams({ url: url.trim() });
  const ts = normalizeTimestamp(timestamp);
  if (ts) params.set("timestamp", ts);

  const endpoint = `https://archive.org/wayback/available?${params.toString()}`;
  const res = await fetchWithTimeout(endpoint, timeoutMs);

  let data: AvailableResponse;
  try {
    data = (await res.json()) as AvailableResponse;
  } catch {
    throw new Error("Wayback API returned a non-JSON response");
  }

  const closest = data.archived_snapshots?.closest;
  if (!closest || !closest.available || !closest.url || !closest.timestamp) {
    return null;
  }

  return {
    url: data.url ?? url,
    archivedUrl: closest.url,
    timestamp: closest.timestamp,
    isoDate: timestampToIso(closest.timestamp),
    status: closest.status ?? "unknown",
  };
}

/**
 * List up to `limit` archived snapshots of `url` using the CDX capture index.
 *
 * The CDX API returns a JSON array whose first row is a header. We map the
 * remaining rows into structured `Snapshot` objects. Returns an empty array
 * when the URL has no captures.
 */
export async function listSnapshots(
  url: string,
  limit: number = 10,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Snapshot[]> {
  if (!url || url.trim().length === 0) {
    throw new Error("url is required and must be a non-empty string");
  }
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 10, 1000));

  const params = new URLSearchParams({
    url: url.trim(),
    output: "json",
    limit: String(safeLimit),
    fl: "timestamp,original,statuscode,mimetype",
    // Collapse consecutive identical captures of the same day to reduce noise.
    collapse: "timestamp:8",
  });

  const endpoint = `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
  const res = await fetchWithTimeout(endpoint, timeoutMs);

  const text = await res.text();
  if (!text.trim()) return [];

  let rows: string[][];
  try {
    rows = JSON.parse(text) as string[][];
  } catch {
    throw new Error("Wayback CDX API returned a non-JSON response");
  }

  if (!Array.isArray(rows) || rows.length <= 1) return [];

  // First row is the header: ["timestamp","original","statuscode","mimetype"].
  const header = rows[0];
  const idx = {
    timestamp: header.indexOf("timestamp"),
    original: header.indexOf("original"),
    statuscode: header.indexOf("statuscode"),
    mimetype: header.indexOf("mimetype"),
  };

  return rows.slice(1).map((row) => {
    const ts = row[idx.timestamp] ?? "";
    const original = row[idx.original] ?? url;
    return {
      url: original,
      archivedUrl: `https://web.archive.org/web/${ts}/${original}`,
      timestamp: ts,
      isoDate: timestampToIso(ts),
      status: row[idx.statuscode] ?? "unknown",
      mimetype: idx.mimetype >= 0 ? row[idx.mimetype] : undefined,
    };
  });
}
