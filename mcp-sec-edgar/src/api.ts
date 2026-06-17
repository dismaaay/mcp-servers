/**
 * Core SEC EDGAR API logic.
 *
 * This module deliberately contains NO Model Context Protocol imports so it can
 * be unit-tested or reused independently of the MCP transport layer.
 *
 * SEC requires a descriptive User-Agent on every request (a company/app name and
 * a contact email). Requests without one are throttled or blocked.
 * See: https://www.sec.gov/os/webmaster-faq#developers
 */

// SEC's WAF rejects User-Agent strings that contain URLs (it returns 403).
// The accepted format is a descriptive app/company name plus a contact email,
// e.g. "mcp-sec-edgar admin@example.com". Override via SEC_EDGAR_USER_AGENT.
const SEC_USER_AGENT =
  process.env.SEC_EDGAR_USER_AGENT ?? "mcp-sec-edgar contact@example.com";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
const COMPANY_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";

const REQUEST_TIMEOUT_MS = 10_000;

/** A single company entry from the SEC ticker directory. */
export interface CompanyMatch {
  /** Zero-padded 10-digit CIK, e.g. "0000320193". */
  cik: string;
  /** Numeric CIK as reported by SEC, e.g. 320193. */
  cikNumber: number;
  ticker: string;
  title: string;
}

/** A normalized recent filing record. */
export interface FilingRecord {
  form: string;
  filingDate: string;
  reportDate: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  /** Direct link to the filing's index page on EDGAR. */
  url: string;
}

/** A single reported XBRL fact value. */
export interface FactValue {
  label: string;
  unit: string;
  value: number;
  end: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  form: string;
}

/**
 * Perform a GET request against SEC with the required User-Agent and a hard
 * timeout. Throws a descriptive Error on non-2xx responses or network failures.
 */
async function secFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`SEC resource not found (404): ${url}`);
      }
      throw new Error(`SEC request failed with HTTP ${res.status} for ${url}`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`SEC request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Left-pad a numeric CIK to the 10-digit form SEC's data endpoints require. */
export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

let tickerCache: CompanyMatch[] | null = null;

/** Fetch (and memoize for the process lifetime) the full SEC ticker directory. */
async function loadTickers(): Promise<CompanyMatch[]> {
  if (tickerCache) return tickerCache;
  const data = (await secFetch(TICKERS_URL)) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  tickerCache = Object.values(data).map((e) => ({
    cik: padCik(e.cik_str),
    cikNumber: e.cik_str,
    ticker: e.ticker,
    title: e.title,
  }));
  return tickerCache;
}

/**
 * Look up companies by exact ticker or by case-insensitive substring of the
 * ticker or company name. Exact ticker matches are ranked first.
 */
export async function lookupCompany(query: string, limit = 10): Promise<CompanyMatch[]> {
  const q = query.trim();
  if (!q) throw new Error("Query must not be empty.");
  const companies = await loadTickers();
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();

  const exact = companies.filter((c) => c.ticker.toUpperCase() === upper);
  const partial = companies.filter(
    (c) =>
      c.ticker.toUpperCase() !== upper &&
      (c.ticker.toLowerCase().includes(lower) || c.title.toLowerCase().includes(lower)),
  );
  return [...exact, ...partial].slice(0, limit);
}

/** Resolve a ticker-or-name query to a single best-match company. */
export async function resolveCompany(query: string): Promise<CompanyMatch> {
  const matches = await lookupCompany(query, 1);
  if (matches.length === 0) {
    throw new Error(`No SEC-registered company found matching "${query}".`);
  }
  return matches[0];
}

/**
 * Get the most recent filings for a company resolved from a ticker or name.
 * Returns normalized records with a direct EDGAR index URL for each filing.
 */
export async function getRecentFilings(
  tickerOrName: string,
  limit = 10,
): Promise<{ company: CompanyMatch; filings: FilingRecord[] }> {
  const company = await resolveCompany(tickerOrName);
  const data = (await secFetch(`${SUBMISSIONS_BASE}/CIK${company.cik}.json`)) as {
    filings: {
      recent: {
        accessionNumber: string[];
        filingDate: string[];
        reportDate: string[];
        form: string[];
        primaryDocument: string[];
        primaryDocDescription: string[];
      };
    };
  };
  const r = data.filings.recent;
  const count = Math.min(limit, r.accessionNumber.length);
  const filings: FilingRecord[] = [];
  for (let i = 0; i < count; i++) {
    const accession = r.accessionNumber[i];
    const accNoDash = accession.replace(/-/g, "");
    const doc = r.primaryDocument[i] || `${accession}-index.htm`;
    filings.push({
      form: r.form[i],
      filingDate: r.filingDate[i],
      reportDate: r.reportDate[i] ?? "",
      accessionNumber: accession,
      primaryDocument: r.primaryDocument[i] ?? "",
      primaryDocDescription: r.primaryDocDescription[i] ?? "",
      url: `https://www.sec.gov/Archives/edgar/data/${company.cikNumber}/${accNoDash}/${doc}`,
    });
  }
  return { company, filings };
}

/**
 * Fetch headline XBRL company facts (financial concepts) for a company.
 * Returns the latest reported value for a curated set of common concepts plus
 * the raw count of available concepts.
 */
export async function getCompanyFacts(
  tickerOrName: string,
): Promise<{
  company: CompanyMatch;
  entityName: string;
  totalConcepts: number;
  highlights: FactValue[];
}> {
  const company = await resolveCompany(tickerOrName);
  const data = (await secFetch(`${COMPANY_FACTS_BASE}/CIK${company.cik}.json`)) as {
    entityName: string;
    facts: Record<
      string,
      Record<
        string,
        {
          label: string;
          units: Record<
            string,
            Array<{
              end: string;
              val: number;
              fy?: number;
              fp?: string;
              form?: string;
            }>
          >;
        }
      >
    >;
  };

  const taxonomies = data.facts ?? {};
  let totalConcepts = 0;
  for (const tax of Object.values(taxonomies)) {
    totalConcepts += Object.keys(tax).length;
  }

  // Curated headline concepts most users care about, in priority order.
  const wanted = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "NetIncomeLoss",
    "Assets",
    "Liabilities",
    "StockholdersEquity",
    "CashAndCashEquivalentsAtCarryingValue",
    "EarningsPerShareBasic",
    "EntityCommonStockSharesOutstanding",
  ];

  const highlights: FactValue[] = [];
  const usGaap = taxonomies["us-gaap"] ?? {};
  const dei = taxonomies["dei"] ?? {};

  for (const concept of wanted) {
    const node = usGaap[concept] ?? dei[concept];
    if (!node || !node.units) continue;
    // Pick the unit with data and take the most recent reported value.
    const unitKeys = Object.keys(node.units);
    if (unitKeys.length === 0) continue;
    const unit = unitKeys[0];
    const series = node.units[unit];
    if (!series || series.length === 0) continue;
    const latest = series.reduce((a, b) => (a.end >= b.end ? a : b));
    highlights.push({
      label: node.label || concept,
      unit,
      value: latest.val,
      end: latest.end,
      fiscalYear: latest.fy ?? null,
      fiscalPeriod: latest.fp ?? null,
      form: latest.form ?? "",
    });
  }

  return {
    company,
    entityName: data.entityName,
    totalConcepts,
    highlights,
  };
}
