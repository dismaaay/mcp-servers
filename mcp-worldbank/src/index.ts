#!/usr/bin/env node
/**
 * World Bank MCP server.
 *
 * Exposes the public World Bank Indicators API as MCP tools over stdio:
 *   - get_indicator(country, indicator, years?)
 *   - search_indicators(query, limit?)
 *   - list_countries()
 *
 * All logs go to stderr so stdout stays a clean JSON-RPC channel.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getIndicator,
  searchIndicators,
  listCountries,
  WorldBankError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-worldbank",
  version: "1.0.0",
});

/** Wrap a tool body so thrown errors become MCP error results, not crashes. */
function toErrorResult(err: unknown) {
  const message =
    err instanceof WorldBankError
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
  "get_indicator",
  {
    title: "Get World Bank indicator",
    description:
      "Fetch time-series values for a World Bank development indicator for a country. " +
      "Provide an ISO country code (2 or 3 letters, e.g. 'US', 'BRA') or 'all', plus an " +
      "indicator code (e.g. 'NY.GDP.MKTP.CD' for GDP, 'SP.POP.TOTL' for population). " +
      "Optionally pass a year or year range. Use search_indicators to discover indicator codes.",
    inputSchema: {
      country: z
        .string()
        .describe("ISO country code, 2 or 3 letters (e.g. 'US', 'BRA'), or 'all'."),
      indicator: z
        .string()
        .describe("World Bank indicator code, e.g. 'NY.GDP.MKTP.CD' or 'SP.POP.TOTL'."),
      years: z
        .string()
        .optional()
        .describe("Optional year or range: 'YYYY' (e.g. '2020') or 'YYYY:YYYY' (e.g. '2010:2020')."),
    },
  },
  async ({ country, indicator, years }) => {
    try {
      const { indicatorName, observations } = await getIndicator(country, indicator, years);
      const header = `${indicatorName} (${indicator}) — ${observations[0]?.country || country}`;
      const lines = observations
        .map((o) => `  ${o.date}: ${o.value === null ? "no data" : o.value}${o.unit ? " " + o.unit : ""}`)
        .join("\n");
      const text = `${header}\n${lines}`;
      return {
        content: [{ type: "text", text }],
        structuredContent: { indicatorName, observations },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "search_indicators",
  {
    title: "Search World Bank indicators",
    description:
      "Search the World Bank indicator catalog by free text. Matches against indicator " +
      "code and name (all words must appear). Returns indicator codes you can pass to " +
      "get_indicator. Example queries: 'gdp per capita', 'CO2 emissions', 'life expectancy'.",
    inputSchema: {
      query: z.string().describe("Free-text search term, e.g. 'gdp per capita' or 'CO2'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of results to return (default 25)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await searchIndicators(query, limit ?? 25);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No indicators matched "${query}".` }],
          structuredContent: { results: [] },
        };
      }
      const text = results
        .map((r) => `${r.id}\t${r.name}${r.source ? ` [${r.source}]` : ""}`)
        .join("\n");
      return {
        content: [
          { type: "text", text: `Found ${results.length} indicator(s):\n${text}` },
        ],
        structuredContent: { results },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "list_countries",
  {
    title: "List World Bank countries",
    description:
      "List all countries and aggregate regions known to the World Bank API, with their " +
      "ISO codes, region, income level, and capital. Use the returned codes with get_indicator.",
    inputSchema: {},
  },
  async () => {
    try {
      const countries = await listCountries();
      const text = countries
        .map((c) => `${c.id}\t${c.iso2Code}\t${c.name}${c.incomeLevel ? ` (${c.incomeLevel})` : ""}`)
        .join("\n");
      return {
        content: [
          { type: "text", text: `${countries.length} entries:\n${text}` },
        ],
        structuredContent: { countries },
      };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-worldbank running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-worldbank:", err);
  process.exit(1);
});
