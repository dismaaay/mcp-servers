/**
 * Core Open Trivia DB API client.
 *
 * This module is intentionally free of any MCP imports so it can be unit-tested
 * and reused independently. It only depends on the Node global `fetch`.
 *
 * Open Trivia DB: https://opentdb.com/api_config.php
 */

const BASE_URL = "https://opentdb.com";
const USER_AGENT =
  "mcp-trivia/1.0 (+https://github.com/mcp-catalog/mcp-trivia) Node-fetch";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Allowed difficulty values accepted by the Open Trivia DB API. */
export type Difficulty = "easy" | "medium" | "hard";

/** Allowed question types accepted by the Open Trivia DB API. */
export type QuestionType = "multiple" | "boolean";

export interface TriviaCategory {
  id: number;
  name: string;
}

export interface TriviaQuestion {
  type: QuestionType;
  difficulty: Difficulty;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface GetQuestionsParams {
  amount: number;
  category?: number;
  difficulty?: Difficulty;
  type?: QuestionType;
}

/**
 * Human-readable messages for the Open Trivia DB `response_code` field.
 * See https://opentdb.com/api_config.php
 */
const RESPONSE_CODE_MESSAGES: Record<number, string> = {
  0: "Success.",
  1: "No results: the API could not return enough questions for your query. Try a smaller amount, a different category, or a different difficulty.",
  2: "Invalid parameter: one or more arguments were not valid (e.g. amount out of range, unknown category).",
  3: "Token not found.",
  4: "Token empty: this session has returned all possible questions for the query.",
  5: "Rate limit: too many requests. Each IP may only access the API once every 5 seconds.",
};

/** Performs a GET request with a hard timeout and a descriptive User-Agent. */
async function getJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(
        `Open Trivia DB request failed: HTTP ${res.status} ${res.statusText} for ${url}`
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Open Trivia DB request timed out after ${timeoutMs}ms for ${url}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Open Trivia DB returns text fields HTML-escaped. Decode the common entities. */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&rsquo;/g, "’")
    .replace(/&hellip;/g, "…")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&deg;/g, "°")
    .replace(/&shy;/g, "")
    .replace(/&amp;#?\w+;/g, " ")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(Number(code))
    );
}

interface CategoryApiResponse {
  trivia_categories: TriviaCategory[];
}

interface QuestionsApiResponse {
  response_code: number;
  results: TriviaQuestion[];
}

/**
 * Lists every trivia category available from the Open Trivia DB.
 * Endpoint: GET /api_category.php
 */
export async function listCategories(
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TriviaCategory[]> {
  const data = await getJson<CategoryApiResponse>(
    `${BASE_URL}/api_category.php`,
    timeoutMs
  );
  if (!Array.isArray(data.trivia_categories)) {
    throw new Error("Unexpected response from Open Trivia DB category endpoint.");
  }
  return data.trivia_categories;
}

/**
 * Fetches trivia questions from the Open Trivia DB.
 * Endpoint: GET /api.php
 *
 * Text fields (question / answers / category) are returned HTML-decoded.
 */
export async function getQuestions(
  params: GetQuestionsParams,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<TriviaQuestion[]> {
  const amount = Math.trunc(params.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 50) {
    throw new Error("`amount` must be an integer between 1 and 50.");
  }

  const url = new URL(`${BASE_URL}/api.php`);
  url.searchParams.set("amount", String(amount));
  if (params.category !== undefined) {
    url.searchParams.set("category", String(params.category));
  }
  if (params.difficulty !== undefined) {
    url.searchParams.set("difficulty", params.difficulty);
  }
  if (params.type !== undefined) {
    url.searchParams.set("type", params.type);
  }

  const data = await getJson<QuestionsApiResponse>(url.toString(), timeoutMs);

  if (data.response_code !== 0) {
    const message =
      RESPONSE_CODE_MESSAGES[data.response_code] ??
      `Open Trivia DB returned response_code ${data.response_code}.`;
    throw new Error(message);
  }

  return data.results.map((q) => ({
    ...q,
    question: decodeHtmlEntities(q.question),
    correct_answer: decodeHtmlEntities(q.correct_answer),
    incorrect_answers: q.incorrect_answers.map(decodeHtmlEntities),
    category: decodeHtmlEntities(q.category),
  }));
}
