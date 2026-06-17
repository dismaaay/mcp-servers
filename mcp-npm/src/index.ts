#!/usr/bin/env node
/**
 * mcp-npm — Model Context Protocol server for the npm registry.
 *
 * Exposes three tools over stdio:
 *   - get_package(name)            : metadata for a single package
 *   - search_packages(query,limit) : full-text registry search
 *   - get_downloads(name,period)   : download counts for a period
 *
 * All real network logic lives in src/api.ts. This file is only the MCP glue.
 * Per the MCP stdio contract, NOTHING is written to stdout except protocol
 * frames; all logging goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getPackage,
  searchPackages,
  getDownloads,
  DOWNLOAD_PERIODS,
  NpmApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-npm",
  version: "1.0.0",
});

/** Wrap a tool handler so any error becomes a clean MCP error result. */
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function fail(err: unknown) {
  const message =
    err instanceof NpmApiError
      ? err.message
      : err instanceof Error
        ? `Unexpected error: ${err.message}`
        : "Unknown error";
  console.error(`[mcp-npm] tool error: ${message}`);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

server.registerTool(
  "get_package",
  {
    title: "Get npm package",
    description:
      "Get metadata for an npm package: latest version, description, license, " +
      "homepage, repository, author, maintainers, keywords, dist-tags and " +
      "publish date. Accepts scoped names like @scope/name.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('npm package name, e.g. "react" or "@types/node"'),
    },
  },
  async ({ name }) => {
    try {
      const pkg = await getPackage(name);
      return ok(JSON.stringify(pkg, null, 2));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "search_packages",
  {
    title: "Search npm packages",
    description:
      "Full-text search of the npm registry. Returns the top matching " +
      "packages with name, version, description, publisher and relevance score.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe('Search text, e.g. "react state management"'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Max results to return (1-25, default 10)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await searchPackages(query, limit ?? 10);
      return ok(JSON.stringify(results, null, 2));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_downloads",
  {
    title: "Get npm download stats",
    description:
      "Get download counts for an npm package over a period. Period must be " +
      `one of: ${DOWNLOAD_PERIODS.join(", ")} (default last-week).`,
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('npm package name, e.g. "express"'),
      period: z
        .enum(DOWNLOAD_PERIODS)
        .optional()
        .describe("Time window for download counts (default last-week)"),
    },
  },
  async ({ name, period }) => {
    try {
      const stats = await getDownloads(name, period ?? "last-week");
      return ok(JSON.stringify(stats, null, 2));
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the MCP protocol.
  console.error("mcp-npm running on stdio");
}

main().catch((err) => {
  console.error("[mcp-npm] fatal:", err);
  process.exit(1);
});
