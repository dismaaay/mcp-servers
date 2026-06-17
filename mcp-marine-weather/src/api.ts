/**
 * Core Open-Meteo Marine API client.
 *
 * This module is intentionally free of any MCP imports so it can be unit-tested
 * or reused independently of the protocol layer. It uses the Node global
 * `fetch` (Node >= 18) with a hard request timeout and stderr-only logging.
 */

export const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
export const USER_AGENT =
  "mcp-marine-weather/1.0 (+https://github.com/mcp-catalog/mcp-marine-weather)";
const REQUEST_TIMEOUT_MS = 10_000;

/** Current marine variables requested from Open-Meteo. */
const CURRENT_VARIABLES = [
  "wave_height",
  "wave_direction",
  "wave_period",
  "wind_wave_height",
  "wind_wave_direction",
  "wind_wave_period",
  "swell_wave_height",
  "swell_wave_direction",
  "swell_wave_period",
  "sea_surface_temperature",
] as const;

export interface MarineQuery {
  latitude: number;
  longitude: number;
}

/** Shape of the relevant parts of the Open-Meteo Marine response. */
export interface MarineApiResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  elevation?: number;
  current_units?: Record<string, string>;
  current?: Record<string, number | string | null>;
  error?: boolean;
  reason?: string;
}

/** Normalized, ready-to-present marine snapshot. */
export interface MarineSnapshot {
  latitude: number;
  longitude: number;
  timezone: string;
  time: string | null;
  metrics: MarineMetric[];
}

export interface MarineMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit: string;
}

const METRIC_LABELS: Record<string, string> = {
  wave_height: "Significant wave height",
  wave_direction: "Wave direction",
  wave_period: "Wave period",
  wind_wave_height: "Wind wave height",
  wind_wave_direction: "Wind wave direction",
  wind_wave_period: "Wind wave period",
  swell_wave_height: "Swell wave height",
  swell_wave_direction: "Swell wave direction",
  swell_wave_period: "Swell wave period",
  sea_surface_temperature: "Sea surface temperature",
};

export class MarineApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarineApiError";
  }
}

function validateCoords({ latitude, longitude }: MarineQuery): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new MarineApiError(
      `latitude must be a number between -90 and 90 (got ${latitude})`
    );
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new MarineApiError(
      `longitude must be a number between -180 and 180 (got ${longitude})`
    );
  }
}

/**
 * Fetch a current marine-weather snapshot for the given coordinates.
 * Throws {@link MarineApiError} on validation, network, timeout, or API errors.
 */
export async function getMarine(query: MarineQuery): Promise<MarineSnapshot> {
  validateCoords(query);

  const url = new URL(MARINE_API_URL);
  url.searchParams.set("latitude", String(query.latitude));
  url.searchParams.set("longitude", String(query.longitude));
  url.searchParams.set("current", CURRENT_VARIABLES.join(","));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      throw new MarineApiError(
        `Request to Open-Meteo Marine API timed out after ${REQUEST_TIMEOUT_MS} ms`
      );
    }
    throw new MarineApiError(
      `Network error calling Open-Meteo Marine API: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  let body: MarineApiResponse;
  try {
    body = (await res.json()) as MarineApiResponse;
  } catch {
    throw new MarineApiError(
      `Open-Meteo Marine API returned a non-JSON response (HTTP ${res.status})`
    );
  }

  // Open-Meteo signals errors with { error: true, reason: "..." }.
  if (body.error) {
    throw new MarineApiError(
      `Open-Meteo Marine API error: ${body.reason ?? "unknown reason"}`
    );
  }
  if (!res.ok) {
    throw new MarineApiError(
      `Open-Meteo Marine API responded with HTTP ${res.status}`
    );
  }
  if (!body.current) {
    throw new MarineApiError(
      "Open-Meteo Marine API response did not include current marine data"
    );
  }

  return normalize(body);
}

function normalize(body: MarineApiResponse): MarineSnapshot {
  const current = body.current ?? {};
  const units = body.current_units ?? {};

  const metrics: MarineMetric[] = [];
  for (const key of CURRENT_VARIABLES) {
    if (key in current) {
      metrics.push({
        key,
        label: METRIC_LABELS[key] ?? key,
        value: current[key],
        unit: units[key] ?? "",
      });
    }
  }

  return {
    latitude: body.latitude,
    longitude: body.longitude,
    timezone: body.timezone ?? "GMT",
    time: (current.time as string | undefined) ?? null,
    metrics,
  };
}

/** Render a snapshot as a compact, human-readable text block. */
export function formatSnapshot(s: MarineSnapshot): string {
  const lines: string[] = [];
  lines.push(
    `Marine conditions at ${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)} (${s.timezone})`
  );
  if (s.time) lines.push(`Observation time: ${s.time}`);
  lines.push("");
  for (const m of s.metrics) {
    const val = m.value === null || m.value === undefined ? "n/a" : m.value;
    lines.push(`- ${m.label}: ${val}${m.unit ? " " + m.unit : ""}`);
  }
  return lines.join("\n");
}
