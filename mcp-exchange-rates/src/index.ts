#!/usr/bin/env node
/**
 * Exchange Rates MCP server.
 *
 * Exposes three tools over the Model Context Protocol (stdio transport):
 *   - convert(amount, from, to)        live currency conversion
 *   - latest(base)                     latest rates for a base currency
 *   - history(from, to, base, date)    historical rate on a given date
 *
 * Data source: Frankfurter (https://frankfurter.dev) — free, no API key,
 * European Central Bank reference rates.
 *
 * IMPORTANT: stdout is reserved for the MCP protocol. All human-facing logging
 * goes to stderr via console.error.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convert, latest, history } from "./api.js";

const server = new McpServer({
  name: "mcp-exchange-rates",
  version: "1.0.0",
});

/** Wrap a result string as MCP text content. */
function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/** Wrap an error as an MCP tool error result (isError) with a readable message. */
function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

server.registerTool(
  "convert",
  {
    title: "Convert currency",
    description:
      "Convert an amount from one currency to another using the latest exchange rate. " +
      "Currencies are 3-letter ISO 4217 codes (e.g. USD, EUR, GBP).",
    inputSchema: {
      amount: z.number().nonnegative().describe("The amount of money to convert, e.g. 100"),
      from: z.string().length(3).describe("Source currency code, e.g. USD"),
      to: z.string().length(3).describe("Target currency code, e.g. EUR"),
    },
  },
  async ({ amount, from, to }) => {
    try {
      const r = await convert(amount, from, to);
      return text(
        `${r.amount} ${r.from} = ${r.result} ${r.to}\n` +
          `Rate: 1 ${r.from} = ${r.rate.toFixed(6)} ${r.to} (as of ${r.date})`,
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "latest",
  {
    title: "Latest rates",
    description:
      "Get the latest exchange rates for a base currency against all supported currencies. " +
      "Base defaults to EUR if omitted.",
    inputSchema: {
      base: z
        .string()
        .length(3)
        .optional()
        .describe("Base currency code (default EUR), e.g. USD"),
    },
  },
  async ({ base }) => {
    try {
      const r = await latest(base);
      const lines = Object.entries(r.rates)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, rate]) => `  1 ${r.base} = ${rate} ${code}`)
        .join("\n");
      return text(`Latest rates for ${r.base} (as of ${r.date}):\n${lines}`);
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "history",
  {
    title: "Historical rate",
    description:
      "Get a historical exchange rate for a specific date (YYYY-MM-DD). " +
      "Weekends/holidays snap to the most recent business day.",
    inputSchema: {
      from: z.string().length(3).describe("Source currency code, e.g. USD"),
      to: z.string().length(3).describe("Target currency code, e.g. EUR"),
      date: z.string().describe("Date in YYYY-MM-DD format, e.g. 2024-01-02"),
      base: z
        .string()
        .length(3)
        .optional()
        .describe("Optional alias for the source currency; overrides `from` if set"),
    },
  },
  async ({ from, to, date, base }) => {
    try {
      const r = await history(from, to, date, base);
      const note =
        r.actualDate !== r.date
          ? ` (no quote on ${r.date}; using nearest business day ${r.actualDate})`
          : "";
      return text(
        `On ${r.date}${note}: 1 ${r.from} = ${r.rate} ${r.to}`,
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-exchange-rates running on stdio (data: frankfurter.dev)");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-exchange-rates:", err);
  process.exit(1);
});
