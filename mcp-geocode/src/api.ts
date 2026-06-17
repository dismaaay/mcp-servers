/**
 * Core Nominatim API client.
 *
 * This module has NO MCP dependencies so it can be unit-tested in isolation.
 * All logging goes to stderr (console.error) so it never corrupts the stdio
 * MCP protocol stream on stdout.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

/**
 * Nominatim's usage policy requires a descriptive User-Agent identifying the
 * application. See https://operations.osmfoundation.org/policies/nominatim/
 */
const USER_AGENT =
  "mcp-geocode/1.0.0 (Model Context Protocol server; +https://github.com/mcp-catalog/mcp-geocode)";

const DEFAULT_TIMEOUT_MS = 10_000;

/** A single normalized Nominatim place result. */
export interface Place {
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  category: string;
  /** Approximate confidence / prominence score (0..1). */
  importance: number | null;
  address: Record<string, string>;
  boundingBox: [number, number, number, number] | null;
  osmType: string | null;
  osmId: number | null;
  licence: string | null;
}

/** Raw subset of the Nominatim jsonv2 response we care about. */
interface RawPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  category?: string;
  importance?: number;
  address?: Record<string, string>;
  boundingbox?: string[];
  osm_type?: string;
  osm_id?: number;
  licence?: string;
  error?: string | { code: number; message: string };
}

export class NominatimError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "NominatimError";
  }
}

function normalize(raw: RawPlace): Place {
  let boundingBox: [number, number, number, number] | null = null;
  if (Array.isArray(raw.boundingbox) && raw.boundingbox.length === 4) {
    const nums = raw.boundingbox.map(Number) as number[];
    if (nums.every((n) => Number.isFinite(n))) {
      boundingBox = nums as [number, number, number, number];
    }
  }
  return {
    displayName: raw.display_name ?? "(no name)",
    lat: raw.lat !== undefined ? Number(raw.lat) : NaN,
    lon: raw.lon !== undefined ? Number(raw.lon) : NaN,
    type: raw.type ?? "unknown",
    category: raw.category ?? "unknown",
    importance:
      typeof raw.importance === "number" ? raw.importance : null,
    address: raw.address ?? {},
    boundingBox,
    osmType: raw.osm_type ?? null,
    osmId: typeof raw.osm_id === "number" ? raw.osm_id : null,
    licence: raw.licence ?? null,
  };
}

async function nominatimFetch(
  path: string,
  params: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const url = new URL(`${NOMINATIM_BASE}/${path}`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  console.error(`[mcp-geocode] GET ${url.toString()}`);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new NominatimError(
        `Request to Nominatim timed out after ${timeoutMs}ms`,
        err
      );
    }
    throw new NominatimError(
      `Network error contacting Nominatim: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NominatimError(
      `Nominatim returned HTTP ${res.status} ${res.statusText}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new NominatimError("Nominatim returned invalid JSON", err);
  }

  // Reverse geocoding can return an object with an `error` field.
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    "error" in (json as Record<string, unknown>)
  ) {
    const e = (json as RawPlace).error;
    const msg =
      typeof e === "string" ? e : e?.message ?? "unknown error";
    throw new NominatimError(`Nominatim error: ${msg}`);
  }

  return json;
}

/**
 * Forward geocode: turn a free-form query (address, place name, landmark)
 * into a list of matching places with coordinates.
 */
export async function geocode(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new NominatimError("Query must not be empty");
  }
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 50);
  const json = await nominatimFetch(
    "search",
    { q: trimmed, limit: String(limit) },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (!Array.isArray(json)) {
    throw new NominatimError("Unexpected response shape from Nominatim search");
  }
  return json.map((r) => normalize(r as RawPlace));
}

/**
 * Reverse geocode: turn a latitude/longitude pair into the nearest known
 * place / address.
 */
export async function reverse(
  lat: number,
  lon: number,
  opts: { timeoutMs?: number } = {}
): Promise<Place> {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new NominatimError(`Invalid latitude: ${lat} (must be -90..90)`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new NominatimError(`Invalid longitude: ${lon} (must be -180..180)`);
  }
  const json = await nominatimFetch(
    "reverse",
    { lat: String(lat), lon: String(lon) },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  if (Array.isArray(json) || !json || typeof json !== "object") {
    throw new NominatimError(
      "Unexpected response shape from Nominatim reverse"
    );
  }
  return normalize(json as RawPlace);
}

/** Render a Place as a human-readable text block for MCP tool output. */
export function formatPlace(p: Place, index?: number): string {
  const head = index !== undefined ? `${index}. ` : "";
  const lines = [
    `${head}${p.displayName}`,
    `   Coordinates: ${p.lat}, ${p.lon}`,
    `   Type: ${p.category}/${p.type}`,
  ];
  if (p.importance !== null) {
    lines.push(`   Importance: ${p.importance.toFixed(4)}`);
  }
  if (p.osmType && p.osmId !== null) {
    lines.push(`   OSM: ${p.osmType}/${p.osmId}`);
  }
  return lines.join("\n");
}
