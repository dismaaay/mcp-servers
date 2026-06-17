/**
 * Core Data USA API client.
 *
 * This module is intentionally free of any MCP / protocol imports so it can be
 * unit tested and reused independently of the server transport.
 *
 * Data USA exposes its data through a Tesseract OLAP backend. The relevant
 * endpoints used here are:
 *   - https://api.datausa.io/tesseract/data.jsonrecords  (query data)
 *   - https://api.datausa.io/tesseract/cubes             (catalog of cubes)
 *
 * Population data lives in the `acs_yg_total_population_1` cube (ACS 1-year
 * estimate, US Census Bureau, table B01003). The cube exposes a `Geography`
 * dimension (Nation, State, County, Place, Zip, ...) and a `Year` dimension,
 * with `Population` as the measure.
 */

const API_BASE = "https://api.datausa.io/tesseract";

/** Cube backing population queries (ACS 1-year estimate). */
export const POPULATION_CUBE = "acs_yg_total_population_1";

/** Descriptive User-Agent so the upstream service can identify this client. */
const USER_AGENT =
  "mcp-datausa/1.0.0 (+https://github.com/mcp-catalog/mcp-datausa)";

/** Network timeout for all upstream calls, in milliseconds. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Geography levels supported by the population cube, smallest config surface. */
export const GEO_LEVELS = [
  "Nation",
  "State",
  "County",
  "Place",
  "Zip",
  "MSA",
  "PUMA",
  "Congressional District",
] as const;

export type GeoLevel = (typeof GEO_LEVELS)[number];

/** A single record returned by a Tesseract data query. */
export type DataRecord = Record<string, string | number>;

/** Shape of a Tesseract `data.jsonrecords` response. */
export interface DataResponse {
  data: DataRecord[];
  columns: string[];
  annotations?: Record<string, unknown>;
  page?: { limit: number; offset: number; total: number };
}

/** Error thrown for any non-recoverable upstream / validation failure. */
export class DataUsaError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DataUsaError";
  }
}

/**
 * Perform a GET request against the Data USA Tesseract API with a hard timeout,
 * a descriptive User-Agent, and consistent error handling. Always returns
 * parsed JSON or throws a {@link DataUsaError}.
 */
async function getJson<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new DataUsaError(
        `Request to Data USA timed out after ${REQUEST_TIMEOUT_MS}ms: ${url.pathname}`,
        err
      );
    }
    throw new DataUsaError(
      `Network error contacting Data USA: ${(err as Error).message}`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DataUsaError(
      `Data USA returned HTTP ${res.status} for ${url.pathname}${
        body ? `: ${body.slice(0, 300)}` : ""
      }`
    );
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new DataUsaError(
      "Data USA returned a non-JSON response (the API path may have changed).",
      err
    );
  }
}

/**
 * Run an arbitrary measure/drilldown query against a Tesseract cube.
 *
 * @param measure   Measure to aggregate, e.g. "Population".
 * @param drilldown Drilldown level, e.g. "State" or "Nation".
 * @param opts.cube Cube name (defaults to the population cube).
 * @param opts.year Optional year filter; "latest" resolves the most recent year.
 */
export async function query(
  measure: string,
  drilldown: string,
  opts: { cube?: string; year?: string } = {}
): Promise<DataResponse> {
  const cube = opts.cube ?? POPULATION_CUBE;

  // Always include the Year level so callers can see the time dimension and so
  // "latest" can be resolved client-side (the API has no `year=latest` token).
  const drilldowns = drilldown === "Year" ? "Year" : `${drilldown},Year`;

  const params: Record<string, string> = {
    cube,
    drilldowns,
    measures: measure,
  };

  const resp = await getJson<DataResponse>("data.jsonrecords", params);

  if (!resp || !Array.isArray(resp.data)) {
    throw new DataUsaError(
      "Unexpected response shape from Data USA (missing `data` array)."
    );
  }

  if (opts.year && opts.year !== "all") {
    resp.data = filterByYear(resp.data, opts.year);
  }

  return resp;
}

/** Filter records to a specific year, or to the latest year when "latest". */
function filterByYear(rows: DataRecord[], year: string): DataRecord[] {
  if (rows.length === 0) return rows;
  const years = rows
    .map((r) => Number(r["Year"]))
    .filter((n) => Number.isFinite(n));
  if (years.length === 0) return rows;

  const target =
    year === "latest" ? Math.max(...years) : Number(year);
  if (!Number.isFinite(target)) return rows;

  return rows.filter((r) => Number(r["Year"]) === target);
}

/**
 * Get population for a geography. Returns records (one per geographic unit) for
 * the latest available year by default.
 *
 * @param geo Geography level (defaults to "Nation").
 */
export async function getPopulation(
  geo: GeoLevel = "Nation"
): Promise<{
  year: number | null;
  records: { name: string; population: number }[];
  source: string;
}> {
  const resp = await query("Population", geo, { year: "latest" });

  const records = resp.data
    .map((r) => ({
      name: String(r[geo] ?? r["Geography"] ?? "Unknown"),
      population: Number(r["Population"]),
    }))
    .filter((r) => Number.isFinite(r.population))
    .sort((a, b) => b.population - a.population);

  const year =
    resp.data.length > 0 ? Number(resp.data[0]["Year"]) : null;

  const source =
    (resp.annotations?.["source_name"] as string | undefined) ??
    "US Census Bureau, American Community Survey";

  return {
    year: Number.isFinite(year as number) ? (year as number) : null,
    records,
    source,
  };
}
