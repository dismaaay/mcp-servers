#!/usr/bin/env node
/**
 * mcp-zip-postal — Model Context Protocol server for worldwide postal/ZIP code
 * lookups, backed by the free Zippopotam.us API (no API key required).
 *
 * Tools:
 *   - lookup_postal(country, code)      full record (country, places, coords, state)
 *   - places_for_postal(country, code)  just the locality names for the code
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchPostal, fetchPlaceNames, PostalApiError } from "./api.js";

const server = new McpServer({
  name: "mcp-zip-postal",
  version: "1.0.0",
});

const countrySchema = z
  .string()
  .min(2)
  .describe("ISO-style country code, e.g. 'us', 'de', 'gb', 'fr', 'ca'.");

const codeSchema = z
  .string()
  .min(1)
  .describe("Postal / ZIP code, e.g. '90210' (US) or '01067' (DE).");

function errorResult(err: unknown) {
  const message =
    err instanceof PostalApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

server.registerTool(
  "lookup_postal",
  {
    title: "Look up postal code",
    description:
      "Look up a postal/ZIP code for a country and return the full record: " +
      "country, post code, and every associated place with its state and " +
      "latitude/longitude. Uses the free Zippopotam.us API.",
    inputSchema: {
      country: countrySchema,
      code: codeSchema,
    },
  },
  async ({ country, code }) => {
    try {
      const result = await fetchPostal(country, code);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "places_for_postal",
  {
    title: "Places for postal code",
    description:
      "Return just the list of place/locality names associated with a " +
      "postal/ZIP code in a given country (a focused subset of lookup_postal). " +
      "Uses the free Zippopotam.us API.",
    inputSchema: {
      country: countrySchema,
      code: codeSchema,
    },
  },
  async ({ country, code }) => {
    try {
      const result = await fetchPlaceNames(country, code);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-zip-postal running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-zip-postal:", err);
  process.exit(1);
});
