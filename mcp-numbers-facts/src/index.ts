#!/usr/bin/env node
/**
 * Numbers Facts MCP server.
 *
 * Exposes three tools over the Model Context Protocol (stdio transport):
 *   - number_fact(number)      -> trivia fact about an integer
 *   - math_fact(number)        -> mathematical fact about an integer
 *   - date_fact(month, day)    -> historical/calendar fact about a date
 *
 * Wraps the original Numbers API (http://numbersapi.com) with a resilient
 * archive + local fallback so it always returns a real fact. No API key needed.
 *
 * All diagnostic logging goes to stderr; stdout is reserved for the MCP stdio
 * JSON-RPC channel.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getNumberFact,
  getMathFact,
  getDateFact,
  type NumberFact,
} from "./api.js";

const server = new McpServer({
  name: "mcp-numbers-facts",
  version: "1.0.0",
});

function factToContent(fact: NumberFact) {
  return {
    content: [
      {
        type: "text" as const,
        text: fact.text,
      },
    ],
    structuredContent: {
      text: fact.text,
      number: Number.isFinite(fact.number) ? fact.number : null,
      type: fact.type,
      found: fact.found,
      source: fact.source,
    },
  };
}

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
  };
}

server.registerTool(
  "number_fact",
  {
    title: "Number Fact",
    description:
      "Get an interesting trivia fact about an integer (e.g. 42 -> \"42 is the number of kilometers in a marathon.\"). Wraps the Numbers API.",
    inputSchema: {
      number: z
        .number()
        .int()
        .describe("The integer to get a trivia fact about, e.g. 42."),
    },
  },
  async ({ number }) => {
    try {
      return factToContent(await getNumberFact(number));
    } catch (err) {
      return errorContent(err);
    }
  },
);

server.registerTool(
  "math_fact",
  {
    title: "Math Fact",
    description:
      "Get a mathematical fact about an integer (e.g. 1729 -> properties such as primality, factorization, perfect/Fibonacci/square numbers). Wraps the Numbers API.",
    inputSchema: {
      number: z
        .number()
        .int()
        .describe("The integer to get a mathematical fact about, e.g. 1729."),
    },
  },
  async ({ number }) => {
    try {
      return factToContent(await getMathFact(number));
    } catch (err) {
      return errorContent(err);
    }
  },
);

server.registerTool(
  "date_fact",
  {
    title: "Date Fact",
    description:
      "Get a fact about a calendar date given its month and day (e.g. month=2, day=29 -> a fact about February 29th). Wraps the Numbers API.",
    inputSchema: {
      month: z
        .number()
        .int()
        .min(1)
        .max(12)
        .describe("Month of the year, 1 (January) through 12 (December)."),
      day: z
        .number()
        .int()
        .min(1)
        .max(31)
        .describe("Day of the month, 1 through 31."),
    },
  },
  async ({ month, day }) => {
    try {
      return factToContent(await getDateFact(month, day));
    } catch (err) {
      return errorContent(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-numbers-facts running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-numbers-facts:", err);
  process.exit(1);
});
