#!/usr/bin/env node
/**
 * mcp-coinbase-spot
 *
 * An MCP (Model Context Protocol) server that exposes Coinbase's public,
 * no-key market data endpoints as tools:
 *   - spot_price(pair)         -> current spot price for a trading pair
 *   - exchange_rates(currency) -> exchange rates for a base currency
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getExchangeRates,
  getSpotPrice,
  CoinbaseApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-coinbase-spot",
  version: "1.0.0",
});

server.registerTool(
  "spot_price",
  {
    title: "Coinbase Spot Price",
    description:
      "Get the current Coinbase spot price for a trading pair. Accepts a base " +
      "asset like 'BTC' (defaults quote to USD) or a full pair like 'ETH-EUR', " +
      "'BTC/GBP', or 'sol-usd'. Returns the price amount, base asset, and quote currency.",
    inputSchema: {
      pair: z
        .string()
        .min(1)
        .describe(
          "Trading pair or base asset, e.g. 'BTC-USD', 'ETH-EUR', or just 'BTC'.",
        ),
    },
  },
  async ({ pair }) => {
    try {
      const data = await getSpotPrice(pair);
      const text =
        `${data.base}/${data.currency} spot price: ${data.amount} ${data.currency}`;
      return {
        content: [
          { type: "text", text },
          { type: "text", text: JSON.stringify(data, null, 2) },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "exchange_rates",
  {
    title: "Coinbase Exchange Rates",
    description:
      "Get Coinbase exchange rates for a base currency (fiat or crypto), e.g. " +
      "'USD', 'EUR', or 'BTC'. Returns a map of currency code -> rate. Useful " +
      "for converting one currency into many others.",
    inputSchema: {
      currency: z
        .string()
        .min(1)
        .describe("Base currency code, e.g. 'USD', 'EUR', or 'BTC'."),
    },
  },
  async ({ currency }) => {
    try {
      const data = await getExchangeRates(currency);
      const rateCount = Object.keys(data.rates).length;
      const summary =
        `Exchange rates for ${data.currency} (${rateCount} currencies). ` +
        `Examples: ` +
        ["EUR", "GBP", "JPY", "BTC", "ETH"]
          .filter((c) => data.rates[c] !== undefined)
          .map((c) => `1 ${data.currency} = ${data.rates[c]} ${c}`)
          .join("; ");
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(data, null, 2) },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

/** Convert any thrown error into a structured MCP tool error result. */
function toolError(err: unknown) {
  const message =
    err instanceof CoinbaseApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`[mcp-coinbase-spot] tool error: ${message}`);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-coinbase-spot] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-coinbase-spot] fatal:", err);
  process.exit(1);
});
