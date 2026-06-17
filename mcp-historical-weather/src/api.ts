/**
 * Core logic for fetching historical daily weather from the Open-Meteo Archive API.
 *
 * This module intentionally contains NO MCP-specific imports so it can be unit
 * tested and reused independently of the Model Context Protocol transport layer.
 *
 * API docs: https://open-meteo.com/en/docs/historical-weather-api
 */

const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";

/** Descriptive User-Agent so the upstream API can identify this client (good API citizenship). */
const USER_AGENT =
  "mcp-historical-weather/1.0.0 (+https://github.com/mcp-catalog/mcp-historical-weather)";

/** Default per-request network timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Daily weather variables we request from the archive. */
const DAILY_VARIABLES = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "precipitation_sum",
  "rain_sum",
  "snowfall_sum",
  "windspeed_10m_max",
] as const;

export interface GetHistoryParams {
  latitude: number;
  longitude: number;
  /** Inclusive start date in YYYY-MM-DD format. */
  start_date: string;
  /** Inclusive end date in YYYY-MM-DD format. */
  end_date: string;
  /** Optional temperature unit, defaults to celsius. */
  temperature_unit?: "celsius" | "fahrenheit";
  /** Optional override for the network timeout (ms). */
  timeoutMs?: number;
}

export interface DailyRecord {
  date: string;
  temperature_max: number | null;
  temperature_min: number | null;
  temperature_mean: number | null;
  precipitation_sum: number | null;
  rain_sum: number | null;
  snowfall_sum: number | null;
  windspeed_max: number | null;
}

export interface HistoryResult {
  resolved_latitude: number;
  resolved_longitude: number;
  elevation: number;
  timezone: string;
  start_date: string;
  end_date: string;
  units: {
    temperature: string;
    precipitation: string;
    windspeed: string;
  };
  days: DailyRecord[];
  summary: {
    day_count: number;
    avg_temperature_max: number | null;
    avg_temperature_min: number | null;
    total_precipitation: number | null;
  };
}

/** Raw shape returned by the Open-Meteo Archive API (only the fields we use). */
interface ArchiveResponse {
  error?: boolean;
  reason?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  daily_units?: Record<string, string>;
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
    precipitation_sum?: (number | null)[];
    rain_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    windspeed_10m_max?: (number | null)[];
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertValidParams(p: GetHistoryParams): void {
  if (typeof p.latitude !== "number" || Number.isNaN(p.latitude) || p.latitude < -90 || p.latitude > 90) {
    throw new Error(`latitude must be a number between -90 and 90 (got ${p.latitude})`);
  }
  if (typeof p.longitude !== "number" || Number.isNaN(p.longitude) || p.longitude < -180 || p.longitude > 180) {
    throw new Error(`longitude must be a number between -180 and 180 (got ${p.longitude})`);
  }
  if (!DATE_RE.test(p.start_date)) {
    throw new Error(`start_date must be in YYYY-MM-DD format (got "${p.start_date}")`);
  }
  if (!DATE_RE.test(p.end_date)) {
    throw new Error(`end_date must be in YYYY-MM-DD format (got "${p.end_date}")`);
  }
  if (p.start_date > p.end_date) {
    throw new Error(`start_date (${p.start_date}) must not be after end_date (${p.end_date})`);
  }
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(mean * 100) / 100;
}

function sum(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Fetch historical daily weather for a coordinate over an inclusive date range.
 * Throws an Error with a descriptive message on validation, network, or API failure.
 */
export async function getHistory(params: GetHistoryParams): Promise<HistoryResult> {
  assertValidParams(params);

  const url = new URL(ARCHIVE_ENDPOINT);
  url.searchParams.set("latitude", String(params.latitude));
  url.searchParams.set("longitude", String(params.longitude));
  url.searchParams.set("start_date", params.start_date);
  url.searchParams.set("end_date", params.end_date);
  url.searchParams.set("daily", DAILY_VARIABLES.join(","));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", params.temperature_unit ?? "celsius");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
      throw new Error(`Request to Open-Meteo Archive timed out after ${params.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new Error(`Network error contacting Open-Meteo Archive: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  let body: ArchiveResponse;
  try {
    body = (await res.json()) as ArchiveResponse;
  } catch {
    throw new Error(`Open-Meteo Archive returned a non-JSON response (HTTP ${res.status})`);
  }

  // Open-Meteo returns HTTP 400 with {error:true, reason:"..."} for bad params.
  if (body.error) {
    throw new Error(`Open-Meteo Archive error: ${body.reason ?? "unknown reason"}`);
  }
  if (!res.ok) {
    throw new Error(`Open-Meteo Archive request failed with HTTP ${res.status}`);
  }

  const daily = body.daily ?? {};
  const times = daily.time ?? [];

  const days: DailyRecord[] = times.map((date, i) => ({
    date,
    temperature_max: daily.temperature_2m_max?.[i] ?? null,
    temperature_min: daily.temperature_2m_min?.[i] ?? null,
    temperature_mean: daily.temperature_2m_mean?.[i] ?? null,
    precipitation_sum: daily.precipitation_sum?.[i] ?? null,
    rain_sum: daily.rain_sum?.[i] ?? null,
    snowfall_sum: daily.snowfall_sum?.[i] ?? null,
    windspeed_max: daily.windspeed_10m_max?.[i] ?? null,
  }));

  const units = body.daily_units ?? {};

  return {
    resolved_latitude: body.latitude ?? params.latitude,
    resolved_longitude: body.longitude ?? params.longitude,
    elevation: body.elevation ?? 0,
    timezone: body.timezone ?? "UTC",
    start_date: params.start_date,
    end_date: params.end_date,
    units: {
      temperature: units.temperature_2m_max ?? "°C",
      precipitation: units.precipitation_sum ?? "mm",
      windspeed: units.windspeed_10m_max ?? "km/h",
    },
    days,
    summary: {
      day_count: days.length,
      avg_temperature_max: average(days.map((d) => d.temperature_max)),
      avg_temperature_min: average(days.map((d) => d.temperature_min)),
      total_precipitation: sum(days.map((d) => d.precipitation_sum)),
    },
  };
}
