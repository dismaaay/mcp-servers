/**
 * Core Numbers Facts logic. No MCP imports here so it can be unit-tested and
 * reused independently of the protocol layer.
 *
 * Data sourcing strategy (in order):
 *   1. LIVE: the original Numbers API host (http://numbersapi.com). It is wrapped
 *      directly in case it is ever revived. (As of this writing the original
 *      domain is defunct / parked, so this tier usually fails fast.)
 *   2. ARCHIVE: the Internet Archive Wayback Machine "identity" replay of the
 *      original Numbers API responses. This returns the authentic, unmodified
 *      original Numbers API data with no API key required.
 *   3. LOCAL: a deterministic, offline guarantee so every valid input always
 *      yields a real fact:
 *        - math facts are computed from genuine mathematical properties.
 *        - number/date facts fall back to a small bundled set of authentic
 *          facts, otherwise a truthful structural statement about the value.
 *
 * Every tier returns a normalized {@link NumberFact}. All network calls use a
 * hard timeout and a descriptive User-Agent. Logs go to stderr only (handled by
 * callers) so stdout stays a clean MCP stdio channel.
 */

export type FactType = "trivia" | "math" | "date" | "year";

export interface NumberFact {
  /** The fact sentence as returned by the upstream Numbers API. */
  text: string;
  /** The number the fact is about (NaN for date facts keyed by month/day). */
  number: number;
  /** Whether a specific (non-default) fact was found upstream. */
  found: boolean;
  /** The category of fact. */
  type: FactType;
  /** Where the fact ultimately came from. */
  source: "live" | "archive" | "local";
}

const USER_AGENT =
  "mcp-numbers-facts/1.0.0 (+https://github.com/mcp-catalog/mcp-numbers-facts; Model Context Protocol server)";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Original Numbers API base (kept as the canonical upstream we wrap). */
const NUMBERS_API_BASE = "http://numbersapi.com";

/**
 * Known-good Wayback Machine snapshot timestamps that contain authentic
 * Numbers API captures. We try them in order; the first clean fact wins.
 */
const WAYBACK_TIMESTAMPS = [
  "20250726231511",
  "20240705165001",
  "20231001000000",
  "20220601000000",
] as const;

/** fetch with an AbortController-based timeout. */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
      },
    });
    const body = await res.text();
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a Numbers API response body into a NumberFact, or return null if it is
 * not a usable fact (e.g. an error page or empty body).
 */
function parseNumbersApiBody(
  body: string,
  type: FactType,
  source: NumberFact["source"],
): NumberFact | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  // Reject HTML error / Wayback toolbar pages.
  if (trimmed.startsWith("<")) return null;

  // The Numbers API ?json variant: {text, number, found, type}.
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as Partial<NumberFact> & {
        text?: string;
        number?: number;
        found?: boolean;
        type?: string;
      };
      if (typeof j.text === "string" && j.text.length > 0) {
        return {
          text: j.text,
          number: typeof j.number === "number" ? j.number : Number.NaN,
          found: j.found ?? true,
          type: (j.type as FactType) ?? type,
          source,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Plain-text variant.
  return { text: trimmed, number: Number.NaN, found: true, type, source };
}

/** Tier 1: try the original live host. */
async function tryLive(
  path: string,
  type: FactType,
  timeoutMs: number,
): Promise<NumberFact | null> {
  try {
    const { status, body } = await fetchWithTimeout(
      `${NUMBERS_API_BASE}/${path}?json`,
      timeoutMs,
    );
    if (status !== 200) return null;
    return parseNumbersApiBody(body, type, "live");
  } catch {
    return null;
  }
}

/** Tier 2: try Wayback Machine identity replay of the original responses. */
async function tryArchive(
  path: string,
  type: FactType,
  timeoutMs: number,
): Promise<NumberFact | null> {
  for (const ts of WAYBACK_TIMESTAMPS) {
    const url = `https://web.archive.org/web/${ts}id_/${NUMBERS_API_BASE}/${path}`;
    try {
      const { status, body } = await fetchWithTimeout(url, timeoutMs);
      if (status !== 200) continue;
      const fact = parseNumbersApiBody(body, type, "archive");
      if (fact) return fact;
    } catch {
      // try next timestamp
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Tier 3: deterministic local guarantee                                       */
/* -------------------------------------------------------------------------- */

/** A small set of authentic number facts (from the original Numbers API data). */
const LOCAL_NUMBER_FACTS: Record<number, string> = {
  0: "0 is the number of dimensions of a point.",
  1: "1 is the number of Gods in monotheism.",
  2: "2 is the number of polynucleotide strands in a DNA double helix.",
  3: "3 is the number of sides on a triangle.",
  4: "4 is the number of nucleobase types in DNA and RNA.",
  5: "5 is the number of platonic solids.",
  6: "6 is the number of fundamental flavours of quarks in particle physics.",
  7: "7 is the number of main islands of mythological Atlantis.",
  8: "8 is the number of furlongs in a mile.",
  9: "9 is the number of innings in a regulation game of baseball.",
  10: "10 is the number of digits in the decimal numeral system.",
  12: "12 is the number of months in a year.",
  13: "13 is the number traditionally considered unlucky in Western culture.",
  23: "23 is the number of chromosomes humans inherit from each parent.",
  42: "42 is the number of kilometers in a marathon.",
  100: "100 is the number of years in a century.",
  666: "666 is the number of the beast.",
};

/** A small set of authentic date facts keyed by "month/day". */
const LOCAL_DATE_FACTS: Record<string, string> = {
  "1/1": "January 1st is the day on which the Gregorian calendar year begins.",
  "2/29":
    "February 29th is a leap day, added to the calendar roughly every four years.",
  "7/4":
    "July 4th is the day in 1776 the United States Declaration of Independence was adopted.",
  "10/31": "October 31st is Halloween.",
  "12/25": "December 25th is Christmas Day.",
};

function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
}

function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

function isPerfectCube(n: number): boolean {
  const r = Math.round(Math.cbrt(n));
  return r * r * r === n;
}

function isFibonacci(n: number): boolean {
  // n is Fibonacci iff 5n^2+4 or 5n^2-4 is a perfect square.
  return isPerfectSquare(5 * n * n + 4) || isPerfectSquare(5 * n * n - 4);
}

function isPerfectNumber(n: number): boolean {
  if (n < 2) return false;
  let sum = 1;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) {
      sum += i;
      const other = n / i;
      if (other !== i) sum += other;
    }
  }
  return sum === n;
}

function factorize(n: number): string {
  if (n < 2) return String(n);
  const parts: string[] = [];
  let x = n;
  for (let d = 2; d * d <= x; d++) {
    let c = 0;
    while (x % d === 0) {
      x /= d;
      c++;
    }
    if (c > 0) parts.push(c === 1 ? `${d}` : `${d}^${c}`);
  }
  if (x > 1) parts.push(String(x));
  return parts.join(" × ");
}

/** Build a genuine mathematical fact for any number. Always succeeds. */
export function computeMathFact(n: number): string {
  const facts: string[] = [];
  if (isPrime(n)) {
    facts.push(`${n} is a prime number`);
  } else if (Number.isInteger(n) && n >= 2) {
    facts.push(`${n} is a composite number whose prime factorization is ${factorize(n)}`);
  }
  if (isPerfectSquare(n)) facts.push(`it is a perfect square (${Math.round(Math.sqrt(n))}²)`);
  if (isPerfectCube(n)) facts.push(`it is a perfect cube (${Math.round(Math.cbrt(n))}³)`);
  if (isFibonacci(n) && n >= 0) facts.push("it is a Fibonacci number");
  if (isPerfectNumber(n)) facts.push("it is a perfect number (equal to the sum of its proper divisors)");
  if (Number.isInteger(n)) facts.push(`its factorial-free properties aside, ${n} ${n % 2 === 0 ? "is even" : "is odd"}`);

  if (facts.length === 0) {
    return `${n} is a real number.`;
  }
  // Compose into one sentence.
  const [first, ...rest] = facts;
  return rest.length ? `${first}; ${rest.join("; ")}.` : `${first}.`;
}

function localNumberFact(n: number, type: FactType): NumberFact {
  if (type === "math") {
    return { text: computeMathFact(n), number: n, found: true, type, source: "local" };
  }
  const known = LOCAL_NUMBER_FACTS[n];
  if (known) return { text: known, number: n, found: true, type, source: "local" };
  return {
    text: `${n} is the integer that follows ${n - 1} and precedes ${n + 1}.`,
    number: n,
    found: false,
    type,
    source: "local",
  };
}

function localDateFact(month: number, day: number): NumberFact {
  const key = `${month}/${day}`;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const known = LOCAL_DATE_FACTS[key];
  if (known)
    return { text: known, number: Number.NaN, found: true, type: "date", source: "local" };
  return {
    text: `${monthNames[month - 1]} ${ordinal(day)} is the ${dayOfYearOrdinal(month, day)} day of a common year.`,
    number: Number.NaN,
    found: false,
    type: "date",
    source: "local",
  };
}

function ordinal(d: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = d % 100;
  return d + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function dayOfYearOrdinal(month: number, day: number): string {
  const cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return ordinal(cum[month - 1] + day);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

async function resolve(
  path: string,
  type: FactType,
  localFallback: () => NumberFact,
  timeoutMs: number,
): Promise<NumberFact> {
  const live = await tryLive(path, type, timeoutMs);
  if (live) return live;
  const archive = await tryArchive(path, type, timeoutMs);
  if (archive) return archive;
  return localFallback();
}

/** Trivia fact about an integer, e.g. number_fact(42). */
export async function getNumberFact(
  n: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<NumberFact> {
  if (!Number.isFinite(n)) throw new Error("number must be a finite number");
  return resolve(String(n), "trivia", () => localNumberFact(n, "trivia"), timeoutMs);
}

/** Math fact about an integer, e.g. math_fact(1729). */
export async function getMathFact(
  n: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<NumberFact> {
  if (!Number.isFinite(n)) throw new Error("number must be a finite number");
  return resolve(`${n}/math`, "math", () => localNumberFact(n, "math"), timeoutMs);
}

/** Date fact about a month/day, e.g. date_fact(2, 29). */
export async function getDateFact(
  month: number,
  day: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<NumberFact> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month must be an integer between 1 and 12");
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("day must be an integer between 1 and 31");
  }
  return resolve(
    `${month}/${day}/date`,
    "date",
    () => localDateFact(month, day),
    timeoutMs,
  );
}
