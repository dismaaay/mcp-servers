#!/usr/bin/env node
/**
 * mcp-pokeapi — Model Context Protocol server wrapping PokeAPI (https://pokeapi.co).
 *
 * Exposes three tools over stdio:
 *   - get_pokemon(name)
 *   - get_type(type)
 *   - list_pokemon(limit, offset)
 *
 * IMPORTANT: stdout is reserved for the JSON-RPC protocol. All logging goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getPokemon,
  getType,
  listPokemon,
  formatPokemon,
  formatType,
  formatPokemonList,
  PokeApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-pokeapi",
  version: "1.0.0",
});

/** Wrap a handler so upstream/API errors become clean MCP tool errors instead of crashes. */
function errorResult(err: unknown) {
  const message =
    err instanceof PokeApiError
      ? err.message
      : `Unexpected error: ${(err as Error).message ?? String(err)}`;
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "get_pokemon",
  {
    title: "Get Pokemon",
    description:
      "Look up a single Pokemon by name or Pokedex number. Returns types, height/weight, " +
      "abilities, base stats, and a sprite URL. Example: name='pikachu' or name='25'.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe("Pokemon name (e.g. 'pikachu', 'charizard') or Pokedex id (e.g. '25')."),
    },
  },
  async ({ name }) => {
    try {
      const data = await getPokemon(name);
      return { content: [{ type: "text", text: formatPokemon(data) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_type",
  {
    title: "Get Type",
    description:
      "Look up a damage type (e.g. 'electric', 'water', 'dragon') and its battle damage " +
      "relations: what it is strong/weak against, immunities, and how many Pokemon have it.",
    inputSchema: {
      type: z
        .string()
        .min(1)
        .describe("Type name (e.g. 'fire', 'ghost') or type id (e.g. '10')."),
    },
  },
  async ({ type }) => {
    try {
      const data = await getType(type);
      return { content: [{ type: "text", text: formatType(data) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "list_pokemon",
  {
    title: "List Pokemon",
    description:
      "Browse the Pokedex with pagination. Returns a numbered list of Pokemon names and ids. " +
      "Use 'offset' to page forward (e.g. offset=20 for the next page).",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("How many Pokemon to return (1-100, default 20)."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("How many Pokemon to skip from the start (default 0)."),
    },
  },
  async ({ limit, offset }) => {
    try {
      const data = await listPokemon(limit, offset);
      return { content: [{ type: "text", text: formatPokemonList(data, offset) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-pokeapi running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-pokeapi:", err);
  process.exit(1);
});
