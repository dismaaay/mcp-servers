#!/usr/bin/env node
/**
 * Public APIs Directory MCP server.
 *
 * Exposes two tools over stdio:
 *   - search_apis(query, category?, limit?)  — search 1500+ free public APIs
 *   - list_categories()                      — list all categories with counts
 *
 * All logs go to stderr; stdout is reserved for the MCP JSON-RPC transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchApis,
  listCategories,
  type ApiEntry,
  type CategoryCount,
} from "./api.js";

const server = new McpServer({
  name: "mcp-public-apis",
  version: "1.0.0",
});

/** Render a single API entry as a compact, readable text block. */
function formatEntry(e: ApiEntry): string {
  const auth = e.Auth && e.Auth.trim() ? e.Auth : "none";
  return [
    `${e.API} — ${e.Description}`,
    `  Category: ${e.Category}`,
    `  Auth: ${auth} | HTTPS: ${e.HTTPS ? "yes" : "no"} | CORS: ${e.Cors}`,
    `  Link: ${e.Link}`,
  ].join("\n");
}

server.registerTool(
  "search_apis",
  {
    title: "Search public APIs",
    description:
      "Search the public-apis directory (1500+ free, mostly key-less APIs). " +
      "Matches the query against each API's name and description. " +
      "Optionally filter to a single category (see list_categories).",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search term matched against API name and description, e.g. 'weather'."),
      category: z
        .string()
        .optional()
        .describe("Optional category filter, e.g. 'Animals' (exact category name)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of results to return (default 25, max 100)."),
    },
  },
  async ({ query, category, limit }) => {
    try {
      const { total, returned, results } = await searchApis({
        query,
        category,
        limit,
      });

      if (results.length === 0) {
        const scope = category ? ` in category "${category}"` : "";
        return {
          content: [
            {
              type: "text",
              text: `No public APIs found matching "${query}"${scope}.`,
            },
          ],
        };
      }

      const header =
        `Found ${total} API(s) matching "${query}"` +
        (category ? ` in category "${category}"` : "") +
        ` — showing ${returned}:\n`;
      const body = results.map(formatEntry).join("\n\n");

      return { content: [{ type: "text", text: `${header}\n${body}` }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-public-apis] search_apis error: ${msg}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error searching public APIs: ${msg}` }],
      };
    }
  },
);

server.registerTool(
  "list_categories",
  {
    title: "List API categories",
    description:
      "List every category in the public-apis directory, sorted alphabetically, " +
      "with the number of APIs in each. Use the category names with search_apis.",
    inputSchema: {},
  },
  async () => {
    try {
      const categories: CategoryCount[] = await listCategories();
      const total = categories.reduce((n, c) => n + c.count, 0);
      const lines = categories.map((c) => `  - ${c.category} (${c.count})`);
      const text =
        `${categories.length} categories covering ${total} APIs:\n` +
        lines.join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-public-apis] list_categories error: ${msg}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error listing categories: ${msg}` }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-public-apis] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-public-apis] fatal:", err);
  process.exit(1);
});
