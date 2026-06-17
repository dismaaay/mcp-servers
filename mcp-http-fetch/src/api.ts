/**
 * Core HTTP logic for mcp-http-fetch.
 *
 * This module contains NO Model Context Protocol imports — it is plain,
 * testable TypeScript that wraps Node's global `fetch`. The MCP server in
 * `index.ts` is a thin adapter on top of these functions.
 */

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Maximum number of characters of a response body we return to the caller. */
const MAX_BODY_CHARS = 100_000;

/**
 * Descriptive User-Agent sent with every outbound request unless the caller
 * overrides it. A clear UA is polite to servers and helps with debugging.
 */
export const DEFAULT_USER_AGENT =
  "mcp-http-fetch/1.0.0 (+https://github.com/mcp-catalog/mcp-http-fetch)";

export interface HttpResult {
  /** HTTP status code, e.g. 200. */
  status: number;
  /** HTTP status text, e.g. "OK". */
  statusText: string;
  /** Final URL after any redirects. */
  url: string;
  /** Whether status is in the 2xx range. */
  ok: boolean;
  /** Lowercased response headers. */
  headers: Record<string, string>;
  /** Response body as text (possibly truncated). */
  body: string;
  /** True when the body was truncated to MAX_BODY_CHARS. */
  truncated: boolean;
}

export interface JsonResult {
  status: number;
  statusText: string;
  url: string;
  ok: boolean;
  /** Parsed JSON value (object, array, string, number, boolean, or null). */
  json: unknown;
}

/** Validate a URL and restrict to http/https to avoid file:// and friends. */
function assertValidUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`,
    );
  }
  return parsed;
}

/** Merge caller-supplied headers over our defaults (case-insensitively). */
function buildHeaders(
  extra?: Record<string, string>,
  extraDefaults?: Record<string, string>,
): Headers {
  const headers = new Headers();
  headers.set("User-Agent", DEFAULT_USER_AGENT);
  headers.set("Accept", "*/*");
  if (extraDefaults) {
    for (const [k, v] of Object.entries(extraDefaults)) headers.set(k, v);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  }
  return headers;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function readBody(
  response: Response,
): Promise<{ body: string; truncated: boolean }> {
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) {
    return { body: text.slice(0, MAX_BODY_CHARS), truncated: true };
  }
  return { body: text, truncated: false };
}

/** Run a fetch with an AbortController-based timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform an HTTP GET request and return status, headers, and body text.
 */
export async function httpGet(
  url: string,
  headers?: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HttpResult> {
  assertValidUrl(url);
  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers: buildHeaders(headers), redirect: "follow" },
    timeoutMs,
  );
  const { body, truncated } = await readBody(response);
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url || url,
    ok: response.ok,
    headers: headersToObject(response.headers),
    body,
    truncated,
  };
}

/**
 * Perform an HTTP POST request. If `body` is a string it is sent as-is; any
 * other value is JSON-serialized and a JSON Content-Type is applied by default.
 */
export async function httpPost(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<HttpResult> {
  assertValidUrl(url);

  let payload: string | undefined;
  const defaultHeaders: Record<string, string> = {};
  if (body === undefined || body === null) {
    payload = undefined;
  } else if (typeof body === "string") {
    payload = body;
  } else {
    payload = JSON.stringify(body);
    defaultHeaders["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: buildHeaders(headers, defaultHeaders),
      body: payload,
      redirect: "follow",
    },
    timeoutMs,
  );
  const { body: respBody, truncated } = await readBody(response);
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url || url,
    ok: response.ok,
    headers: headersToObject(response.headers),
    body: respBody,
    truncated,
  };
}

/**
 * Perform an HTTP GET and parse the response as JSON. Throws a descriptive
 * error if the body is not valid JSON.
 */
export async function fetchJson(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<JsonResult> {
  assertValidUrl(url);
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: buildHeaders(undefined, { Accept: "application/json" }),
      redirect: "follow",
    },
    timeoutMs,
  );
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 200);
    throw new Error(
      `Response from ${response.url || url} was not valid JSON (status ${response.status}). First 200 chars: ${preview}`,
    );
  }
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url || url,
    ok: response.ok,
    json,
  };
}
