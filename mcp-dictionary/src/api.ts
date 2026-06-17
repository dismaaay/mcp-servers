/**
 * Core fetch + formatting logic for the Free Dictionary API.
 *
 * This module deliberately has NO MCP imports so it can be unit-tested and
 * reused independently of the protocol layer.
 *
 * API: https://dictionaryapi.dev/  (no key required)
 * Endpoint: https://api.dictionaryapi.dev/api/v2/entries/en/<word>
 */

const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";
const DEFAULT_TIMEOUT_MS = 10_000;

/** ---- Types reflecting the real API response shape ---- */

export interface Definition {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}

export interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
  synonyms?: string[];
  antonyms?: string[];
}

export interface Phonetic {
  text?: string;
  audio?: string;
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: Phonetic[];
  meanings: Meaning[];
  sourceUrls?: string[];
}

/** Error thrown for any failure (word not found, network, timeout, bad shape). */
export class DictionaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryError";
  }
}

/**
 * Fetch raw dictionary entries for a word from the live API.
 * Throws DictionaryError on not-found, timeout, network failure, or bad shape.
 */
export async function fetchEntries(
  word: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DictionaryEntry[]> {
  const trimmed = word.trim();
  if (!trimmed) {
    throw new DictionaryError("Word must be a non-empty string.");
  }

  const url = `${API_BASE}/${encodeURIComponent(trimmed)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-dictionary/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new DictionaryError(
        `Request timed out after ${timeoutMs}ms while looking up "${trimmed}".`
      );
    }
    throw new DictionaryError(
      `Network error while looking up "${trimmed}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new DictionaryError(`No definitions found for "${trimmed}".`);
  }
  if (!res.ok) {
    throw new DictionaryError(
      `Dictionary API returned HTTP ${res.status} (${res.statusText}) for "${trimmed}".`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new DictionaryError(`Dictionary API returned invalid JSON for "${trimmed}".`);
  }

  // The success response is an array; the not-found response is an object
  // with a `title` field. Guard against both.
  if (!Array.isArray(data)) {
    const message =
      data && typeof data === "object" && "message" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : `No definitions found for "${trimmed}".`;
    throw new DictionaryError(message);
  }

  if (data.length === 0) {
    throw new DictionaryError(`No definitions found for "${trimmed}".`);
  }

  return data as DictionaryEntry[];
}

/**
 * Format full definition output as readable plain text.
 */
export function formatDefinitions(entries: DictionaryEntry[]): string {
  const lines: string[] = [];
  const headword = entries[0]?.word ?? "";

  // Collect a phonetic from whichever entry has one.
  const phonetic =
    entries.map((e) => e.phonetic).find(Boolean) ??
    entries
      .flatMap((e) => e.phonetics ?? [])
      .map((p) => p.text)
      .find(Boolean);

  lines.push(phonetic ? `${headword}  ${phonetic}` : headword);
  lines.push("=".repeat(Math.max(headword.length, 3)));

  for (const entry of entries) {
    for (const meaning of entry.meanings) {
      lines.push("");
      lines.push(`[${meaning.partOfSpeech}]`);
      meaning.definitions.forEach((def, i) => {
        lines.push(`  ${i + 1}. ${def.definition}`);
        if (def.example) {
          lines.push(`     e.g. "${def.example}"`);
        }
      });
      const syns = collectMeaningSynonyms(meaning);
      if (syns.length) {
        lines.push(`  synonyms: ${syns.join(", ")}`);
      }
    }
  }

  const sources = entries.flatMap((e) => e.sourceUrls ?? []).filter(Boolean);
  if (sources.length) {
    lines.push("");
    lines.push(`Source: ${sources[0]}`);
  }

  return lines.join("\n");
}

/** Gather synonyms from a single meaning (meaning-level + definition-level). */
function collectMeaningSynonyms(meaning: Meaning): string[] {
  const set = new Set<string>();
  for (const s of meaning.synonyms ?? []) set.add(s);
  for (const def of meaning.definitions) {
    for (const s of def.synonyms ?? []) set.add(s);
  }
  return [...set];
}

/**
 * Collect all unique synonyms across every meaning of the word, grouped by
 * part of speech. Synonyms live at both meaning-level and definition-level in
 * the API, so we merge both.
 */
export function collectSynonyms(
  entries: DictionaryEntry[]
): { byPartOfSpeech: Record<string, string[]>; all: string[] } {
  const byPartOfSpeech: Record<string, string[]> = {};
  const allSet = new Set<string>();

  for (const entry of entries) {
    for (const meaning of entry.meanings) {
      const syns = collectMeaningSynonyms(meaning);
      if (!syns.length) continue;
      const bucket = (byPartOfSpeech[meaning.partOfSpeech] ??= []);
      for (const s of syns) {
        if (!bucket.includes(s)) bucket.push(s);
        allSet.add(s);
      }
    }
  }

  return { byPartOfSpeech, all: [...allSet] };
}

/** Format synonyms output as readable plain text. */
export function formatSynonyms(entries: DictionaryEntry[]): string {
  const headword = entries[0]?.word ?? "";
  const { byPartOfSpeech, all } = collectSynonyms(entries);

  if (all.length === 0) {
    return `No synonyms found for "${headword}".`;
  }

  const lines: string[] = [`Synonyms for "${headword}":`, ""];
  for (const [pos, syns] of Object.entries(byPartOfSpeech)) {
    lines.push(`[${pos}] ${syns.join(", ")}`);
  }
  return lines.join("\n");
}
