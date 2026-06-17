#!/usr/bin/env node
/**
 * mcp-crypto-prices — a Model Context Protocol server exposing live crypto data
 * from the free CoinGecko API.
 *
 * Tools:
 *   - get_price(ids, vs_currency)
 *   - trending()
 *   - market_top(limit, vs_currency)
 *
 * The server speaks MCP over stdio: stdout carries the JSON-RPC protocol and is
 * never written to directly. All diagnostics go to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CoinGeckoError,
  formatMarketTop,
  formatPrice,
  formatTrending,
  getMarketTop,
  getPrice,
  getTrending,
} from "./api.js";

const server = new McpServer({
  name: "mcp-crypto-prices",
  version: "1.0.0",
});

/** Wrap a tool body so upstream errors become clean MCP error results, not crashes. */
function errorResult(err: unknown) {
  const msg = err instanceof CoinGeckoError ? err.message : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

server.registerTool(
  "get_price",
  {
    title: "Get crypto price",
    description:
      "Get the current price, market cap, and 24h change for one or more cryptocurrencies. " +
      "Use CoinGecko coin ids (e.g. 'bitcoin', 'ethereum', 'solana'), not ticker symbols.",
    inputSchema: {
      ids: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe("CoinGecko coin ids, e.g. ['bitcoin', 'ethereum']"),
      vs_currency: z
        .string()
        .min(1)
        .default("usd")
        .describe("Quote currency code, e.g. 'usd', 'eur', 'gbp'"),
    },
  },
  async ({ ids, vs_currency }) => {
    try {
      const data = await getPrice(ids, vs_currency);
      return { content: [{ type: "text", text: formatPrice(data, vs_currency) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "trending",
  {
    title: "Trending coins",
    description: "List the cryptocurrencies currently trending on CoinGecko (most searched in the last 24h).",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await getTrending();
      return { content: [{ type: "text", text: formatTrending(data) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "market_top",
  {
    title: "Top coins by market cap",
    description: "List the top cryptocurrencies ranked by market capitalisation, with price and 24h change.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(250)
        .default(10)
        .describe("How many coins to return (1-250)"),
      vs_currency: z
        .string()
        .min(1)
        .default("usd")
        .describe("Quote currency code, e.g. 'usd', 'eur'"),
    },
  },
  async ({ limit, vs_currency }) => {
    try {
      const coins = await getMarketTop(limit, vs_currency);
      return { content: [{ type: "text", text: formatMarketTop(coins, vs_currency) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-crypto-prices running on stdio (CoinGecko free API)");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-crypto-prices:", err);
  process.exit(1);
});
