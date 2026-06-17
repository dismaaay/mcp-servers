/**
 * Core openFDA API client.
 *
 * This module contains NO Model Context Protocol imports so it can be reused
 * and unit-tested independently of the MCP transport layer.
 *
 * openFDA reference: https://open.fda.gov/apis/
 * No API key is required for modest request volumes.
 */

const BASE_URL = "https://api.fda.gov";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Descriptive User-Agent. The U.S. Securities and Exchange Commission and many
 * government APIs require (or strongly prefer) a descriptive UA identifying the
 * client; openFDA accepts it and it keeps us a polite API citizen.
 */
const USER_AGENT =
  "mcp-openfda/1.0.0 (Model Context Protocol server; +https://open.fda.gov/apis/)";

export class OpenFdaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenFdaError";
  }
}

interface OpenFdaMeta {
  results?: { skip: number; limit: number; total: number };
  last_updated?: string;
}

interface OpenFdaResponse<T> {
  meta?: OpenFdaMeta;
  results?: T[];
  error?: { code: string; message: string };
}

/**
 * Perform a GET request against an openFDA endpoint with a hard timeout,
 * descriptive User-Agent, and consistent error handling.
 */
async function fdaRequest<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<OpenFdaResponse<T>> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenFdaError(
        `openFDA request timed out after ${REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw new OpenFdaError(
      `Network error contacting openFDA: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  // openFDA returns 404 with a JSON body of {error:{code:"NOT_FOUND"...}}
  // when a query matches nothing. Treat that as an empty result, not a fault.
  if (response.status === 404) {
    return { results: [], meta: { results: { skip: 0, limit: 0, total: 0 } } };
  }

  let body: OpenFdaResponse<T>;
  try {
    body = (await response.json()) as OpenFdaResponse<T>;
  } catch {
    throw new OpenFdaError(
      `openFDA returned a non-JSON response (HTTP ${response.status})`,
    );
  }

  if (!response.ok) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    throw new OpenFdaError(`openFDA error: ${detail}`);
  }

  return body;
}

/** Escape characters that have special meaning in openFDA's Lucene-style query syntax. */
function sanitizeTerm(term: string): string {
  return term.trim().replace(/["\\]/g, " ");
}

// ---------------------------------------------------------------------------
// search_drug_labels
// ---------------------------------------------------------------------------

export interface DrugLabel {
  brand_name?: string;
  generic_name?: string;
  manufacturer?: string;
  purpose?: string;
  indications_and_usage?: string;
  warnings?: string;
  dosage_and_administration?: string;
}

interface RawLabel {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
  };
  purpose?: string[];
  indications_and_usage?: string[];
  warnings?: string[];
  dosage_and_administration?: string[];
}

function truncate(text: string | undefined, max = 600): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Search FDA structured product labeling (drug labels).
 * Matches the query against brand name, generic name, and indications.
 */
export async function searchDrugLabels(
  query: string,
  limit = 5,
): Promise<DrugLabel[]> {
  const term = sanitizeTerm(query);
  if (!term) throw new OpenFdaError("query must not be empty");

  const search =
    `openfda.brand_name:"${term}" ` +
    `openfda.generic_name:"${term}" ` +
    `indications_and_usage:"${term}"`;

  const data = await fdaRequest<RawLabel>("/drug/label.json", {
    search,
    limit,
  });

  return (data.results ?? []).map((r) => ({
    brand_name: r.openfda?.brand_name?.[0],
    generic_name: r.openfda?.generic_name?.[0],
    manufacturer: r.openfda?.manufacturer_name?.[0],
    purpose: truncate(r.purpose?.[0], 300),
    indications_and_usage: truncate(r.indications_and_usage?.[0]),
    warnings: truncate(r.warnings?.[0]),
    dosage_and_administration: truncate(r.dosage_and_administration?.[0], 300),
  }));
}

// ---------------------------------------------------------------------------
// drug_adverse_events
// ---------------------------------------------------------------------------

export interface AdverseEventSummary {
  drug: string;
  total_reports: number;
  top_reactions: { reaction: string; count: number }[];
}

interface RawCount {
  term: string;
  count: number;
}

/**
 * Summarize the most frequently reported adverse-event reactions associated
 * with a drug, using openFDA's FAERS dataset with server-side aggregation.
 */
export async function drugAdverseEvents(
  drug: string,
  limit = 10,
): Promise<AdverseEventSummary> {
  const term = sanitizeTerm(drug);
  if (!term) throw new OpenFdaError("drug must not be empty");

  const search = `patient.drug.medicinalproduct:"${term}"`;

  // Aggregated reaction counts.
  const counts = await fdaRequest<RawCount>("/drug/event.json", {
    search,
    count: "patient.reaction.reactionmeddrapt.exact",
    limit,
  });

  // A single non-aggregated request to read the true total report count.
  const totalProbe = await fdaRequest<unknown>("/drug/event.json", {
    search,
    limit: 1,
  });

  return {
    drug: term,
    total_reports: totalProbe.meta?.results?.total ?? 0,
    top_reactions: (counts.results ?? []).map((c) => ({
      reaction: c.term,
      count: c.count,
    })),
  };
}

// ---------------------------------------------------------------------------
// search_recalls
// ---------------------------------------------------------------------------

export interface DrugRecall {
  recall_number?: string;
  status?: string;
  classification?: string;
  recalling_firm?: string;
  product_description?: string;
  reason_for_recall?: string;
  recall_initiation_date?: string;
  distribution_pattern?: string;
  state?: string;
}

interface RawRecall {
  recall_number?: string;
  status?: string;
  classification?: string;
  recalling_firm?: string;
  product_description?: string;
  reason_for_recall?: string;
  recall_initiation_date?: string;
  distribution_pattern?: string;
  state?: string;
}

/**
 * Search FDA drug enforcement (recall) reports by free text. openFDA matches
 * the term across all indexed fields (firm, product description, reason).
 */
export async function searchRecalls(
  query: string,
  limit = 5,
): Promise<DrugRecall[]> {
  const term = sanitizeTerm(query);
  if (!term) throw new OpenFdaError("query must not be empty");

  const data = await fdaRequest<RawRecall>("/drug/enforcement.json", {
    search: `"${term}"`,
    limit,
  });

  return (data.results ?? []).map((r) => ({
    recall_number: r.recall_number,
    status: r.status,
    classification: r.classification,
    recalling_firm: r.recalling_firm,
    product_description: truncate(r.product_description, 300),
    reason_for_recall: truncate(r.reason_for_recall, 400),
    recall_initiation_date: r.recall_initiation_date,
    distribution_pattern: truncate(r.distribution_pattern, 200),
    state: r.state,
  }));
}
