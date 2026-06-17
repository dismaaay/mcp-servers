/**
 * PokeAPI client — pure fetch logic, no MCP imports so it is independently testable.
 * Docs: https://pokeapi.co/docs/v2
 */

const BASE_URL = "https://pokeapi.co/api/v2";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Raised when the upstream API returns an error or the request fails. */
export class PokeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PokeApiError";
  }
}

/**
 * Fetch JSON from a PokeAPI path with a hard timeout and clear errors.
 * `path` should be relative, e.g. "pokemon/pikachu".
 */
async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${BASE_URL}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "mcp-pokeapi/1.0" },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PokeApiError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw new PokeApiError(`Network error requesting ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    throw new PokeApiError(`Not found: nothing at ${url} (404)`);
  }
  if (!res.ok) {
    throw new PokeApiError(`PokeAPI returned HTTP ${res.status} for ${url}`);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new PokeApiError(`Failed to parse JSON from ${url}: ${(err as Error).message}`);
  }
}

// ---------- Response shapes (only the fields we use) ----------

interface NamedRef {
  name: string;
  url: string;
}

export interface PokemonResponse {
  id: number;
  name: string;
  height: number; // decimetres
  weight: number; // hectograms
  base_experience: number | null;
  types: { slot: number; type: NamedRef }[];
  abilities: { ability: NamedRef; is_hidden: boolean; slot: number }[];
  stats: { base_stat: number; effort: number; stat: NamedRef }[];
  sprites: { front_default: string | null };
}

export interface TypeResponse {
  id: number;
  name: string;
  damage_relations: {
    double_damage_to: NamedRef[];
    double_damage_from: NamedRef[];
    half_damage_to: NamedRef[];
    half_damage_from: NamedRef[];
    no_damage_to: NamedRef[];
    no_damage_from: NamedRef[];
  };
  pokemon: { pokemon: NamedRef; slot: number }[];
}

export interface PokemonListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: NamedRef[];
}

// ---------- API functions ----------

/** Look up a single Pokemon by name or numeric id. */
export async function getPokemon(nameOrId: string): Promise<PokemonResponse> {
  const slug = nameOrId.trim().toLowerCase();
  if (!slug) throw new PokeApiError("Pokemon name must not be empty");
  return fetchJson<PokemonResponse>(`pokemon/${encodeURIComponent(slug)}`);
}

/** Look up a damage type (e.g. "electric", "water") by name or id. */
export async function getType(nameOrId: string): Promise<TypeResponse> {
  const slug = nameOrId.trim().toLowerCase();
  if (!slug) throw new PokeApiError("Type name must not be empty");
  return fetchJson<TypeResponse>(`type/${encodeURIComponent(slug)}`);
}

/** List Pokemon with pagination. */
export async function listPokemon(limit = 20, offset = 0): Promise<PokemonListResponse> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeOffset = Math.max(0, offset);
  return fetchJson<PokemonListResponse>(`pokemon?limit=${safeLimit}&offset=${safeOffset}`);
}

// ---------- Formatters: turn raw responses into readable text ----------

const titleCase = (s: string): string =>
  s
    .split(/[-\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export function formatPokemon(p: PokemonResponse): string {
  const heightM = (p.height / 10).toFixed(1);
  const weightKg = (p.weight / 10).toFixed(1);
  const types = p.types.map((t) => titleCase(t.type.name)).join(", ");
  const abilities = p.abilities
    .map((a) => titleCase(a.ability.name) + (a.is_hidden ? " (hidden)" : ""))
    .join(", ");
  const stats = p.stats
    .map((s) => `  - ${titleCase(s.stat.name)}: ${s.base_stat}`)
    .join("\n");
  const totalStats = p.stats.reduce((sum, s) => sum + s.base_stat, 0);

  return [
    `${titleCase(p.name)} (#${p.id})`,
    `Type: ${types}`,
    `Height: ${heightM} m   Weight: ${weightKg} kg   Base XP: ${p.base_experience ?? "n/a"}`,
    `Abilities: ${abilities}`,
    `Base stats (total ${totalStats}):`,
    stats,
    p.sprites.front_default ? `Sprite: ${p.sprites.front_default}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatType(t: TypeResponse): string {
  const rel = t.damage_relations;
  const names = (arr: NamedRef[]): string =>
    arr.length ? arr.map((x) => titleCase(x.name)).join(", ") : "none";

  return [
    `${titleCase(t.name)} type (#${t.id})`,
    `Super effective against: ${names(rel.double_damage_to)}`,
    `Weak against (takes 2x from): ${names(rel.double_damage_from)}`,
    `Not very effective against: ${names(rel.half_damage_to)}`,
    `Resists (takes 0.5x from): ${names(rel.half_damage_from)}`,
    `No effect against: ${names(rel.no_damage_to)}`,
    `Immune to: ${names(rel.no_damage_from)}`,
    `Pokemon with this type: ${t.pokemon.length}`,
  ].join("\n");
}

export function formatPokemonList(list: PokemonListResponse, offset: number): string {
  const start = offset + 1;
  const rows = list.results
    .map((r, i) => {
      const idMatch = r.url.match(/\/pokemon\/(\d+)\/?$/);
      const id = idMatch ? `#${idMatch[1]}` : "";
      return `  ${String(start + i).padStart(4)}. ${titleCase(r.name)} ${id}`.trimEnd();
    })
    .join("\n");

  return [
    `Pokedex (${list.count} total) — showing ${list.results.length} starting at offset ${offset}:`,
    rows,
    list.next ? "More available — increase offset to page forward." : "End of list reached.",
  ].join("\n");
}
