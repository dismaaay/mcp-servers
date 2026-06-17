/**
 * Core client for the Zippopotam.us postal-code API.
 *
 * This module is intentionally free of any MCP imports so it can be unit
 * tested and reused independently of the server transport layer.
 *
 * API reference: https://api.zippopotam.us  (free, no API key required)
 *   GET /{country}/{code}  ->  postal-code record with one or more places
 */

const BASE_URL = "https://api.zippopotam.us";
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "mcp-zip-postal/1.0.0 (+https://github.com/mcp-catalog/mcp-zip-postal) Model-Context-Protocol postal-code lookup";

/** A single place (locality) associated with a postal code. */
export interface Place {
  placeName: string;
  state: string | null;
  stateAbbreviation: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A normalized postal-code lookup result. */
export interface PostalResult {
  country: string;
  countryAbbreviation: string;
  postCode: string;
  places: Place[];
}

/** Error thrown when a postal code cannot be resolved or the API fails. */
export class PostalApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PostalApiError";
    this.status = status;
  }
}

/** Shape of the raw place object returned by Zippopotam.us. */
interface RawPlace {
  "place name"?: string;
  state?: string;
  "state abbreviation"?: string;
  latitude?: string;
  longitude?: string;
}

/** Shape of the raw response returned by Zippopotam.us. */
interface RawResponse {
  country?: string;
  "country abbreviation"?: string;
  "post code"?: string;
  places?: RawPlace[];
}

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePlace(raw: RawPlace): Place {
  return {
    placeName: raw["place name"] ?? "",
    state: raw.state ?? null,
    stateAbbreviation: raw["state abbreviation"] ?? null,
    latitude: toNumberOrNull(raw.latitude),
    longitude: toNumberOrNull(raw.longitude),
  };
}

/**
 * Look up a postal code for a given country.
 *
 * @param country ISO-style country code, e.g. "us", "de", "gb".
 * @param code    Postal / ZIP code, e.g. "90210".
 * @returns Normalized postal record including all associated places.
 * @throws  {PostalApiError} on bad input, network error, timeout, 404, etc.
 */
export async function fetchPostal(
  country: string,
  code: string,
): Promise<PostalResult> {
  const c = (country ?? "").trim().toLowerCase();
  const z = (code ?? "").trim();

  if (!c) throw new PostalApiError("country is required (e.g. 'us', 'de').");
  if (!z) throw new PostalApiError("code is required (e.g. '90210').");

  const url = `${BASE_URL}/${encodeURIComponent(c)}/${encodeURIComponent(z)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PostalApiError(
        `Request to Zippopotam.us timed out after ${REQUEST_TIMEOUT_MS} ms.`,
      );
    }
    throw new PostalApiError(
      `Network error contacting Zippopotam.us: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new PostalApiError(
      `No results for postal code "${z}" in country "${c}". Check the country code and postal code.`,
      404,
    );
  }

  if (!res.ok) {
    throw new PostalApiError(
      `Zippopotam.us returned HTTP ${res.status} ${res.statusText}.`,
      res.status,
    );
  }

  let data: RawResponse;
  try {
    data = (await res.json()) as RawResponse;
  } catch {
    throw new PostalApiError("Failed to parse JSON response from Zippopotam.us.");
  }

  const places = Array.isArray(data.places) ? data.places : [];

  // Zippopotam.us returns an empty object {} for unknown codes (sometimes 200).
  if (!data["post code"] && places.length === 0) {
    throw new PostalApiError(
      `No results for postal code "${z}" in country "${c}".`,
      404,
    );
  }

  return {
    country: data.country ?? "",
    countryAbbreviation: data["country abbreviation"] ?? c.toUpperCase(),
    postCode: data["post code"] ?? z,
    places: places.map(normalizePlace),
  };
}

/**
 * Return just the list of place names (localities) for a postal code.
 *
 * @param country ISO-style country code.
 * @param code    Postal / ZIP code.
 * @returns Array of place names; may be empty only in degenerate cases.
 * @throws  {PostalApiError} on bad input or API failure.
 */
export async function fetchPlaceNames(
  country: string,
  code: string,
): Promise<{ postCode: string; country: string; placeNames: string[] }> {
  const result = await fetchPostal(country, code);
  return {
    postCode: result.postCode,
    country: result.country,
    placeNames: result.places.map((p) => p.placeName).filter(Boolean),
  };
}
