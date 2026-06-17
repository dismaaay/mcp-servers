/**
 * Open Food Facts API client.
 *
 * Pure data-access layer with NO MCP dependencies so it can be unit-tested
 * and reused independently. All network calls go through `offFetch`, which
 * enforces a timeout and a descriptive User-Agent (required by Open Food
 * Facts — requests without one are served a "temporarily unavailable" page).
 */

const BASE_URL = "https://world.openfoodfacts.org";

/** Dedicated full-text search service (search-a-licious), used as a fallback. */
const SEARCH_BASE_URL = "https://search.openfoodfacts.org";

/**
 * Open Food Facts asks every client to send a descriptive User-Agent.
 * Anonymous / generic agents get rate-limited or blocked with an HTML
 * maintenance page even though the HTTP status is 200.
 * See: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */
const USER_AGENT =
  "mcp-open-food-facts/1.0.0 (https://github.com/mcp-catalog/mcp-open-food-facts)";

const DEFAULT_TIMEOUT_MS = 10_000;

export class OpenFoodFactsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenFoodFactsError";
  }
}

/** A nutriment block (per 100g) extracted from a product. */
export interface Nutriments {
  [key: string]: number | string | undefined;
}

/** Normalised product shape used by both lookup and search. */
export interface Product {
  code: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  categories?: string;
  labels?: string;
  countries?: string;
  ingredients_text?: string;
  nutriscore_grade?: string;
  nova_group?: number;
  ecoscore_grade?: string;
  image_url?: string;
  nutriments?: Nutriments;
}

export interface SearchResult {
  count: number;
  page: number;
  page_size: number;
  products: Product[];
}

const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "generic_name",
  "brands",
  "quantity",
  "categories",
  "labels",
  "countries",
  "ingredients_text",
  "nutriscore_grade",
  "nova_group",
  "ecoscore_grade",
  "image_url",
  "nutriments",
].join(",");

const SEARCH_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "nutriscore_grade",
  "nova_group",
  "categories",
].join(",");

/**
 * Low-level fetch wrapper: sets the required User-Agent, enforces a timeout,
 * verifies the response is JSON (Open Food Facts serves an HTML maintenance
 * page on overload), and parses the body.
 */
async function offFetch<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      throw new OpenFoodFactsError(
        `Request to Open Food Facts timed out after ${timeoutMs}ms.`,
      );
    }
    throw new OpenFoodFactsError(
      `Network error contacting Open Food Facts: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new OpenFoodFactsError(
      `Open Food Facts returned HTTP ${res.status} ${res.statusText}.`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (!contentType.includes("json")) {
    throw new OpenFoodFactsError(
      "Open Food Facts returned a non-JSON response (the service may be " +
        "temporarily unavailable). Please try again shortly.",
    );
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new OpenFoodFactsError(
      "Failed to parse JSON from Open Food Facts response.",
    );
  }
}

/** Trim a barcode to digits only and validate it looks like a real code. */
export function normaliseBarcode(raw: string): string {
  const code = raw.trim();
  if (!/^[0-9]{4,14}$/.test(code)) {
    throw new OpenFoodFactsError(
      `Invalid barcode "${raw}". Expected a numeric product barcode ` +
        "(EAN/UPC, 4–14 digits).",
    );
  }
  return code;
}

/**
 * Fetch a single product by its barcode (EAN/UPC).
 * Returns `null` when the barcode is well-formed but not in the database.
 */
export async function getProduct(
  barcode: string,
  timeoutMs?: number,
): Promise<Product | null> {
  const code = normaliseBarcode(barcode);
  const url =
    `${BASE_URL}/api/v2/product/${encodeURIComponent(code)}.json` +
    `?fields=${encodeURIComponent(PRODUCT_FIELDS)}`;

  const data = await offFetch<{ status?: number; product?: Product }>(
    url,
    timeoutMs,
  );

  // status === 1 means found, 0 means not found.
  if (data.status === 0 || !data.product) {
    return null;
  }
  return data.product;
}

/** Legacy `cgi/search.pl` search. Returns the classic product shape. */
async function searchViaLegacy(
  q: string,
  size: number,
  timeoutMs?: number,
): Promise<SearchResult> {
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(size),
    fields: SEARCH_FIELDS,
  });
  const url = `${BASE_URL}/cgi/search.pl?${params.toString()}`;

  const data = await offFetch<{
    count?: number;
    page?: number;
    page_size?: number | string;
    products?: Product[];
  }>(url, timeoutMs);

  return {
    count: data.count ?? 0,
    page: data.page ?? 1,
    page_size: Number(data.page_size ?? size),
    products: Array.isArray(data.products) ? data.products : [],
  };
}

/**
 * Fallback search via the dedicated search-a-licious service. This service
 * returns `hits` and represents `brands` as an array, so we normalise it
 * back to the common `Product` shape.
 */
async function searchViaSearchALicious(
  q: string,
  size: number,
  timeoutMs?: number,
): Promise<SearchResult> {
  const params = new URLSearchParams({
    q,
    page_size: String(size),
    fields: SEARCH_FIELDS,
  });
  const url = `${SEARCH_BASE_URL}/search?${params.toString()}`;

  type RawHit = Omit<Product, "brands"> & { brands?: string | string[] };
  const data = await offFetch<{
    count?: number;
    page?: number;
    page_size?: number | string;
    hits?: RawHit[];
  }>(url, timeoutMs);

  const products: Product[] = (data.hits ?? []).map((h) => ({
    ...h,
    brands: Array.isArray(h.brands) ? h.brands.join(", ") : h.brands,
  }));

  return {
    count: data.count ?? products.length,
    page: data.page ?? 1,
    page_size: Number(data.page_size ?? size),
    products,
  };
}

/**
 * Full-text search across the Open Food Facts database.
 *
 * Tries the legacy `cgi/search.pl` endpoint first; if it is overloaded
 * (Open Food Facts frequently returns 503 / maintenance pages on that host)
 * it transparently falls back to the dedicated search-a-licious service so
 * the tool stays usable.
 */
export async function searchProducts(
  query: string,
  pageSize = 10,
  timeoutMs?: number,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) {
    throw new OpenFoodFactsError("Search query must not be empty.");
  }
  const size = Math.min(Math.max(pageSize, 1), 50);

  try {
    return await searchViaLegacy(q, size, timeoutMs);
  } catch (primaryErr) {
    try {
      return await searchViaSearchALicious(q, size, timeoutMs);
    } catch (fallbackErr) {
      // Surface the most informative error to the caller.
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fallbackMsg =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      throw new OpenFoodFactsError(
        `Open Food Facts search is currently unavailable. ` +
          `Primary endpoint: ${primaryMsg} | Fallback: ${fallbackMsg}`,
      );
    }
  }
}
