#!/usr/bin/env node
/**
 * mcp-crates — a Model Context Protocol server for the crates.io registry.
 *
 * Exposes two tools over stdio:
 *   - get_crate(name):    detailed metadata for one crate
 *   - search_crates(query, limit?): free-text crate search
 *
 * All diagnostic logging goes to stderr; stdout is reserved for the
 * MCP JSON-RPC protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getCrate,
  searchCrates,
  type CrateInfo,
  type CrateSearchResult,
} from "./api.js";

const server = new McpServer({
  name: "mcp-crates",
  version: "1.0.0",
});

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function renderCrate(c: CrateInfo): string {
  const lines: string[] = [];
  lines.push(`# ${c.name}`);
  if (c.description) lines.push("", c.description);
  lines.push("");
  lines.push(
    `Latest version: ${c.newestVersion ?? c.maxVersion ?? "unknown"}`
  );
  if (c.maxStableVersion && c.maxStableVersion !== c.newestVersion) {
    lines.push(`Latest stable: ${c.maxStableVersion}`);
  }
  lines.push(`Total downloads: ${formatNumber(c.downloads)}`);
  if (c.recentDownloads !== null) {
    lines.push(`Recent downloads (90d): ${formatNumber(c.recentDownloads)}`);
  }
  lines.push(`Published versions: ${formatNumber(c.numVersions)}`);
  if (c.repository) lines.push(`Repository: ${c.repository}`);
  if (c.documentation) lines.push(`Documentation: ${c.documentation}`);
  if (c.homepage) lines.push(`Homepage: ${c.homepage}`);
  if (c.keywords.length) lines.push(`Keywords: ${c.keywords.join(", ")}`);
  if (c.categories.length)
    lines.push(`Categories: ${c.categories.join(", ")}`);
  if (c.updatedAt) lines.push(`Last updated: ${c.updatedAt}`);

  if (c.recentVersions.length) {
    lines.push("", "Recent versions:");
    for (const v of c.recentVersions) {
      const tags: string[] = [];
      if (v.yanked) tags.push("yanked");
      if (v.license) tags.push(v.license);
      const suffix = tags.length ? ` (${tags.join(", ")})` : "";
      lines.push(`  - ${v.num}${suffix} — ${formatNumber(v.downloads)} dl`);
    }
  }

  return lines.join("\n");
}

function renderSearch(r: CrateSearchResult): string {
  if (r.hits.length === 0) {
    return `No crates found matching "${r.query}".`;
  }
  const lines: string[] = [];
  lines.push(
    `Found ${formatNumber(r.total)} crate(s) matching "${r.query}". ` +
      `Showing top ${r.hits.length}:`
  );
  lines.push("");
  for (const h of r.hits) {
    const star = h.exactMatch ? " (exact match)" : "";
    lines.push(`## ${h.name} v${h.maxVersion ?? "?"}${star}`);
    if (h.description) lines.push(h.description.trim());
    const stats = [`${formatNumber(h.downloads)} downloads`];
    if (h.recentDownloads !== null) {
      stats.push(`${formatNumber(h.recentDownloads)} recent`);
    }
    lines.push(stats.join(" · "));
    if (h.repository) lines.push(`repo: ${h.repository}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

server.registerTool(
  "get_crate",
  {
    title: "Get crate details",
    description:
      "Fetch detailed metadata for a single Rust crate from crates.io by its " +
      "exact name. Returns description, latest version, download counts, " +
      "repository, documentation, keywords, and recent published versions.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('The exact crate name, e.g. "serde" or "tokio".'),
    },
  },
  async ({ name }) => {
    try {
      const info = await getCrate(name);
      return { content: [{ type: "text", text: renderCrate(info) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[get_crate] error for "${name}": ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  }
);

server.registerTool(
  "search_crates",
  {
    title: "Search crates",
    description:
      "Search the crates.io registry by free-text query. Returns matching " +
      "crates ranked by relevance with descriptions, latest versions, and " +
      "download counts.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe('Search terms, e.g. "async runtime" or "http client".'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of results to return (1–100, default 10)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const result = await searchCrates(query, limit ?? 10);
      return { content: [{ type: "text", text: renderSearch(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[search_crates] error for "${query}": ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-crates server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-crates:", err);
  process.exit(1);
});
