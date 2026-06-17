/**
 * Core USGS earthquake API logic.
 *
 * This module intentionally has NO dependency on the MCP SDK so it can be
 * unit-tested and reused independently of the server transport.
 *
 * Data source: USGS FDSN event web service (no API key required).
 * Docs: https://earthquake.usgs.gov/fdsnws/event/1/
 */

const USGS_ENDPOINT = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const DEFAULT_TIMEOUT_MS = 10_000;

/** A single parsed earthquake event. */
export interface Quake {
  id: string;
  magnitude: number | null;
  magType: string | null;
  place: string | null;
  title: string;
  time: number; // epoch ms (UTC)
  url: string | null;
  longitude: number | null;
  latitude: number | null;
  depthKm: number | null;
  tsunami: boolean;
  felt: number | null;
}

/** Raw GeoJSON feature shape returned by USGS (subset we use). */
interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    magType: string | null;
    place: string | null;
    title: string;
    time: number;
    url: string | null;
    tsunami: number;
    felt: number | null;
  };
  geometry: {
    coordinates: [number, number, number]; // [lon, lat, depthKm]
  } | null;
}

interface UsgsResponse {
  metadata: { title?: string; count?: number; status?: number };
  features: UsgsFeature[];
}

/** Error type that carries enough context for the caller to surface clearly. */
export class UsgsApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "UsgsApiError";
  }
}

/**
 * Perform a GET against the USGS endpoint with a hard timeout and turn the
 * GeoJSON FeatureCollection into a clean array of {@link Quake}.
 */
async function queryUsgs(
  params: Record<string, string | number>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Quake[]> {
  const url = new URL(USGS_ENDPOINT);
  url.searchParams.set("format", "geojson");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "mcp-earthquakes/1.0 (+https://github.com/)",
        Accept: "application/json",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UsgsApiError(
        `USGS request timed out after ${timeoutMs}ms`,
        err,
      );
    }
    throw new UsgsApiError(
      `Network error contacting USGS: ${(err as Error).message}`,
      err,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // USGS returns 204 (No Content) when a valid query simply has no matches.
    if (res.status === 204) return [];
    const body = await res.text().catch(() => "");
    throw new UsgsApiError(
      `USGS returned HTTP ${res.status} ${res.statusText}` +
        (body ? `: ${body.slice(0, 300)}` : ""),
    );
  }

  let json: UsgsResponse;
  try {
    json = (await res.json()) as UsgsResponse;
  } catch (err) {
    throw new UsgsApiError("USGS returned a non-JSON response", err);
  }

  if (!json || !Array.isArray(json.features)) {
    throw new UsgsApiError("Unexpected USGS response shape (no features array)");
  }

  return json.features.map(parseFeature);
}

function parseFeature(f: UsgsFeature): Quake {
  const coords = f.geometry?.coordinates;
  const p = f.properties;
  return {
    id: f.id,
    magnitude: p.mag,
    magType: p.magType ?? null,
    place: p.place ?? null,
    title: p.title,
    time: p.time,
    url: p.url ?? null,
    longitude: coords ? coords[0] : null,
    latitude: coords ? coords[1] : null,
    depthKm: coords ? coords[2] : null,
    tsunami: p.tsunami === 1,
    felt: p.felt ?? null,
  };
}

export interface RecentOptions {
  minMagnitude?: number;
  limit?: number;
  timeoutMs?: number;
}

/**
 * Most recent earthquakes worldwide, newest first, optionally filtered by a
 * minimum magnitude.
 */
export async function recent(opts: RecentOptions = {}): Promise<Quake[]> {
  const limit = clampLimit(opts.limit ?? 10);
  const params: Record<string, string | number> = {
    orderby: "time",
    limit,
  };
  if (opts.minMagnitude !== undefined) {
    params.minmagnitude = opts.minMagnitude;
  }
  return queryUsgs(params, opts.timeoutMs);
}

export interface ByRegionOptions {
  lat: number;
  lon: number;
  radiusKm: number;
  minMagnitude?: number;
  limit?: number;
  timeoutMs?: number;
}

/**
 * Earthquakes within a circular region defined by a center point and radius,
 * newest first.
 */
export async function byRegion(opts: ByRegionOptions): Promise<Quake[]> {
  const limit = clampLimit(opts.limit ?? 20);
  const params: Record<string, string | number> = {
    orderby: "time",
    latitude: opts.lat,
    longitude: opts.lon,
    maxradiuskm: opts.radiusKm,
    limit,
  };
  if (opts.minMagnitude !== undefined) {
    params.minmagnitude = opts.minMagnitude;
  }
  return queryUsgs(params, opts.timeoutMs);
}

/** USGS caps limit at 20000; we keep tool output sane with a smaller ceiling. */
function clampLimit(limit: number): number {
  return Math.max(1, Math.min(Math.floor(limit), 500));
}

/** Render a list of quakes as readable plain text for a tool result. */
export function formatQuakes(quakes: Quake[], header: string): string {
  if (quakes.length === 0) {
    return `${header}\n\nNo earthquakes matched the query.`;
  }
  const lines = quakes.map((q) => {
    const mag =
      q.magnitude !== null
        ? `M${q.magnitude.toFixed(1)}${q.magType ? ` (${q.magType})` : ""}`
        : "M?";
    const when = new Date(q.time).toISOString().replace("T", " ").slice(0, 19);
    const depth = q.depthKm !== null ? `${q.depthKm.toFixed(0)} km deep` : "depth ?";
    const loc =
      q.latitude !== null && q.longitude !== null
        ? `${q.latitude.toFixed(3)}, ${q.longitude.toFixed(3)}`
        : "location ?";
    const extras: string[] = [];
    if (q.tsunami) extras.push("TSUNAMI flag");
    if (q.felt) extras.push(`${q.felt} felt reports`);
    const extraStr = extras.length ? ` [${extras.join(", ")}]` : "";
    return (
      `- ${mag}  ${q.place ?? q.title}\n` +
      `    ${when} UTC | ${depth} | ${loc}${extraStr}\n` +
      `    ${q.url ?? ""}`
    );
  });
  return `${header}\n\n${lines.join("\n")}`;
}
