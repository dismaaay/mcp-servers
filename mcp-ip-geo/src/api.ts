/**
 * Core geolocation logic for mcp-ip-geo.
 *
 * This module intentionally has NO dependency on the MCP SDK so it can be
 * unit-tested and reused in isolation. It only talks to the live ipapi.co API.
 */

const BASE_URL = "https://ipapi.co";
const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "mcp-ip-geo/1.0 (+https://github.com)";

/**
 * Shape of a successful ipapi.co JSON response. Fields are optional because
 * the upstream API can omit some of them depending on the IP / plan.
 */
export interface GeoResult {
  ip?: string;
  network?: string;
  version?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_name?: string;
  country_code?: string;
  country_code_iso3?: string;
  country_capital?: string;
  country_tld?: string;
  continent_code?: string;
  in_eu?: boolean;
  postal?: string | null;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
  country_calling_code?: string;
  currency?: string;
  currency_name?: string;
  languages?: string;
  country_area?: number;
  country_population?: number;
  asn?: string;
  org?: string;
  // Error fields (present when error === true)
  error?: boolean;
  reason?: string;
  message?: string;
}

/** Error thrown when geolocation fails for any reason. */
export class GeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoError";
  }
}

/** Basic IPv4 / IPv6 validation so we fail fast before hitting the network. */
export function isValidIp(ip: string): boolean {
  const v4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  // Pragmatic IPv6 matcher (covers the common forms incl. compressed "::").
  const v6 = /^(([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}|::([0-9a-fA-F]{1,4}:?){0,7})$/;
  return v4.test(ip) || (ip.includes(":") && v6.test(ip));
}

/**
 * Low-level fetch against ipapi.co with a hard timeout and error handling.
 *
 * @param ip  An IP address to look up, or empty string for the caller's IP.
 */
async function fetchGeo(ip: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoResult> {
  const path = ip ? `/${encodeURIComponent(ip)}/json/` : `/json/`;
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GeoError(`Request to ipapi.co timed out after ${timeoutMs}ms`);
    }
    throw new GeoError(
      `Network error contacting ipapi.co: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new GeoError(`ipapi.co returned HTTP ${res.status} ${res.statusText}`);
  }

  let data: GeoResult;
  try {
    data = (await res.json()) as GeoResult;
  } catch {
    throw new GeoError("ipapi.co returned a response that was not valid JSON");
  }

  // ipapi.co signals logical errors (rate limits, reserved IPs, etc.) in-body.
  if (data.error) {
    const reason = data.reason ? `${data.reason}: ` : "";
    throw new GeoError(`ipapi.co error — ${reason}${data.message ?? "unknown error"}`);
  }

  return data;
}

/** Look up geolocation for a specific IP address. */
export async function lookupIp(ip: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoResult> {
  const trimmed = ip.trim();
  if (!trimmed) {
    throw new GeoError("No IP address provided");
  }
  if (!isValidIp(trimmed)) {
    throw new GeoError(`"${trimmed}" is not a valid IPv4 or IPv6 address`);
  }
  return fetchGeo(trimmed, timeoutMs);
}

/** Look up geolocation for the caller's own public IP (server's egress IP). */
export async function myLocation(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoResult> {
  return fetchGeo("", timeoutMs);
}

/** Format a GeoResult into clean, human-readable text. */
export function formatGeo(geo: GeoResult): string {
  const lines: string[] = [];
  const loc = [geo.city, geo.region, geo.country_name].filter(Boolean).join(", ");

  lines.push(`IP Address:   ${geo.ip ?? "unknown"}${geo.version ? ` (${geo.version})` : ""}`);
  if (loc) lines.push(`Location:     ${loc}`);
  if (geo.postal) lines.push(`Postal Code:  ${geo.postal}`);
  if (geo.latitude != null && geo.longitude != null) {
    lines.push(`Coordinates:  ${geo.latitude}, ${geo.longitude}`);
  }
  if (geo.timezone) {
    lines.push(`Timezone:     ${geo.timezone}${geo.utc_offset ? ` (UTC ${geo.utc_offset})` : ""}`);
  }
  if (geo.currency) {
    lines.push(`Currency:     ${geo.currency}${geo.currency_name ? ` (${geo.currency_name})` : ""}`);
  }
  if (geo.languages) lines.push(`Languages:    ${geo.languages}`);
  if (geo.country_calling_code) lines.push(`Calling Code: ${geo.country_calling_code}`);
  if (geo.org || geo.asn) {
    lines.push(`Network:      ${[geo.org, geo.asn].filter(Boolean).join(" / ")}`);
  }
  if (geo.network) lines.push(`CIDR:         ${geo.network}`);
  if (geo.in_eu != null) lines.push(`In EU:        ${geo.in_eu ? "yes" : "no"}`);

  return lines.join("\n");
}
