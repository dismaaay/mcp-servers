/**
 * Core air-quality logic for the Open-Meteo Air Quality API.
 *
 * This module is intentionally free of any MCP imports so it can be unit-tested
 * and reused independently of the transport layer. It uses the Node global
 * `fetch` (Node >= 18) with a hard 10-second timeout and surfaces clear errors.
 */

const BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const REQUEST_TIMEOUT_MS = 10_000;

/** Pollutant / index fields we request from the "current" endpoint. */
const CURRENT_FIELDS = [
  "european_aqi",
  "us_aqi",
  "pm10",
  "pm2_5",
  "carbon_monoxide",
  "nitrogen_dioxide",
  "sulphur_dioxide",
  "ozone",
] as const;

export interface AirQualityCurrent {
  time?: string;
  interval?: number;
  european_aqi?: number | null;
  us_aqi?: number | null;
  pm10?: number | null;
  pm2_5?: number | null;
  carbon_monoxide?: number | null;
  nitrogen_dioxide?: number | null;
  sulphur_dioxide?: number | null;
  ozone?: number | null;
}

export interface AirQualityResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  elevation?: number;
  current_units?: Record<string, string>;
  current?: AirQualityCurrent;
  /** Present when the API returns an error payload. */
  error?: boolean;
  reason?: string;
}

export interface AirQualityResult {
  location: { latitude: number; longitude: number; elevation?: number };
  time?: string;
  timezone?: string;
  /** Human-readable interpretation of the European AQI band. */
  europeanAqiCategory: string;
  /** Human-readable interpretation of the US AQI band. */
  usAqiCategory: string;
  pollutants: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: string;
  }>;
  raw: AirQualityCurrent;
}

/** Map a European AQI value (0-100+) to its descriptive band. */
export function europeanAqiCategory(aqi: number | null | undefined): string {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return "Unknown";
  if (aqi <= 20) return "Good";
  if (aqi <= 40) return "Fair";
  if (aqi <= 60) return "Moderate";
  if (aqi <= 80) return "Poor";
  if (aqi <= 100) return "Very poor";
  return "Extremely poor";
}

/** Map a US AQI value (0-500) to its descriptive band. */
export function usAqiCategory(aqi: number | null | undefined): string {
  if (aqi === null || aqi === undefined || Number.isNaN(aqi)) return "Unknown";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

const POLLUTANT_LABELS: Record<string, string> = {
  european_aqi: "European AQI",
  us_aqi: "US AQI",
  pm10: "PM10",
  pm2_5: "PM2.5",
  carbon_monoxide: "Carbon monoxide (CO)",
  nitrogen_dioxide: "Nitrogen dioxide (NO₂)",
  sulphur_dioxide: "Sulphur dioxide (SO₂)",
  ozone: "Ozone (O₃)",
};

function validateCoordinate(
  name: "latitude" | "longitude",
  value: number,
  min: number,
  max: number
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max} (got ${value}).`);
  }
}

/**
 * Fetch the current air quality for a coordinate.
 *
 * @throws Error with a clear message on invalid input, network/timeout
 *         failures, non-2xx responses, or API-level error payloads.
 */
export async function getAirQuality(
  latitude: number,
  longitude: number
): Promise<AirQualityResult> {
  validateCoordinate("latitude", latitude, -90, 90);
  validateCoordinate("longitude", longitude, -180, 180);

  const url = new URL(BASE_URL);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", CURRENT_FIELDS.join(","));
  url.searchParams.set("timezone", "auto");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Air Quality API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
      );
    }
    throw new Error(
      `Network error contacting Air Quality API: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await response.text();

  if (!response.ok) {
    // Open-Meteo returns a JSON body with `reason` on errors (e.g. 400).
    let reason = bodyText;
    try {
      const parsed = JSON.parse(bodyText) as { reason?: string };
      if (parsed.reason) reason = parsed.reason;
    } catch {
      /* keep raw text */
    }
    throw new Error(
      `Air Quality API returned HTTP ${response.status}: ${reason}`
    );
  }

  let data: AirQualityResponse;
  try {
    data = JSON.parse(bodyText) as AirQualityResponse;
  } catch {
    throw new Error("Air Quality API returned a non-JSON response.");
  }

  if (data.error) {
    throw new Error(
      `Air Quality API error: ${data.reason ?? "unknown error"}`
    );
  }

  const current = data.current ?? {};
  const units = data.current_units ?? {};

  const pollutants = (CURRENT_FIELDS as readonly string[]).map((key) => ({
    key,
    label: POLLUTANT_LABELS[key] ?? key,
    value: (current as Record<string, number | null | undefined>)[key] ?? null,
    unit: units[key] ?? "",
  }));

  return {
    location: {
      latitude: data.latitude,
      longitude: data.longitude,
      elevation: data.elevation,
    },
    time: current.time,
    timezone: data.timezone,
    europeanAqiCategory: europeanAqiCategory(current.european_aqi),
    usAqiCategory: usAqiCategory(current.us_aqi),
    pollutants,
    raw: current,
  };
}

/** Format an AirQualityResult into a readable text block for tool output. */
export function formatAirQuality(result: AirQualityResult): string {
  const { location, time, timezone } = result;
  const lines: string[] = [];
  lines.push(
    `Air quality for ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` +
      (location.elevation !== undefined
        ? ` (elevation ${location.elevation} m)`
        : "")
  );
  if (time) lines.push(`Observed: ${time}${timezone ? ` (${timezone})` : ""}`);
  lines.push("");
  lines.push(`European AQI: ${formatVal(result.raw.european_aqi)} — ${result.europeanAqiCategory}`);
  lines.push(`US AQI: ${formatVal(result.raw.us_aqi)} — ${result.usAqiCategory}`);
  lines.push("");
  lines.push("Pollutants:");
  for (const p of result.pollutants) {
    if (p.key === "european_aqi" || p.key === "us_aqi") continue;
    lines.push(
      `  - ${p.label}: ${formatVal(p.value)}${p.unit ? ` ${p.unit}` : ""}`
    );
  }
  return lines.join("\n");
}

function formatVal(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : String(v);
}
