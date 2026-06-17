#!/usr/bin/env node
/**
 * Quotes MCP server.
 *
 * Exposes three tools over the Model Context Protocol (stdio transport):
 *   - random_quote(tags?)        : a random inspirational quote, optionally
 *                                  filtered by free-text topic keywords.
 *   - search_quotes(query)       : full-text search across quotes and authors.
 *   - quotes_by_author(author)   : all quotes by a given author.
 *
 * IMPORTANT: stdout is reserved for the MCP protocol. All human-readable
 * logging goes to stderr via console.error.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  randomQuote,
  searchQuotes,
  quotesByAuthor,
  QuoteApiError,
  type Quote,
} from "./api.js";

const server = new McpServer({ name: "mcp-quotes", version: "1.0.0" });

/** Render a single quote as a readable line. */
function formatQuote(q: Quote): string {
  return `"${q.text}"\n   - ${q.author}`;
}

/** Render a list of quotes, or a friendly empty message. */
function formatQuoteList(quotes: Quote[], emptyMsg: string): string {
  if (quotes.length === 0) return emptyMsg;
  return quotes.map((q, i) => `${i + 1}. ${formatQuote(q)}`).join("\n\n");
}

/** Convert thrown errors into a uniform MCP tool error result. */
function errorResult(err: unknown) {
  const msg =
    err instanceof QuoteApiError
      ? err.message
      : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  console.error(`[mcp-quotes] tool error: ${msg}`);
  return { isError: true, content: [{ type: "text" as const, text: msg }] };
}

server.registerTool(
  "random_quote",
  {
    title: "Random Quote",
    description:
      "Get a random inspirational quote. Optionally pass one or more topic keywords in `tags` " +
      "to bias the random pick toward quotes whose text or author mentions those topics " +
      "(e.g. ['love'], ['success', 'wisdom']).",
    inputSchema: {
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional topic keywords to filter the random quote by (matched against quote text and author)."),
    },
  },
  async ({ tags }) => {
    try {
      const q = await randomQuote(tags);
      return { content: [{ type: "text", text: formatQuote(q) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "search_quotes",
  {
    title: "Search Quotes",
    description:
      "Full-text search across the quote catalog. Matches the query against both quote text " +
      "and author name (case-insensitive). Returns up to 10 matching quotes.",
    inputSchema: {
      query: z.string().min(1).describe("The text to search for within quotes and author names."),
    },
  },
  async ({ query }) => {
    try {
      const results = await searchQuotes(query, 10);
      const text = formatQuoteList(results, `No quotes found matching "${query}".`);
      return {
        content: [
          { type: "text", text: `Found ${results.length} quote(s) for "${query}":\n\n${text}` },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "quotes_by_author",
  {
    title: "Quotes by Author",
    description:
      "Return quotes by a given author. The author name is matched case-insensitively as a " +
      "substring, so 'einstein' matches 'Albert Einstein'. Returns up to 20 quotes.",
    inputSchema: {
      author: z.string().min(1).describe("The author's name (or part of it), e.g. 'Rumi' or 'Einstein'."),
    },
  },
  async ({ author }) => {
    try {
      const results = await quotesByAuthor(author, 20);
      const text = formatQuoteList(results, `No quotes found for author "${author}".`);
      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} quote(s) by author matching "${author}":\n\n${text}`,
          },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-quotes] server running on stdio");
}

main().catch((err) => {
  console.error("[mcp-quotes] fatal:", err);
  process.exit(1);
});
