#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getUrls } from "./api.js";

const server = new McpServer({
  name: "mcp-sitemap",
  version: "1.0.0",
});

server.registerTool(
  "get_urls",
  {
    title: "Get URLs from a sitemap",
    description:
      "Fetch and parse a sitemap.xml URL, returning the list of page URLs it " +
      "contains. Supports both standard sitemaps (<urlset>) and sitemap indexes " +
      "(<sitemapindex>). No API key required.",
    inputSchema: {
      sitemap_url: z
        .string()
        .url()
        .describe("Full URL to a sitemap.xml document (http or https)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50000)
        .optional()
        .describe("Maximum number of URLs to return (default 100, max 50000)."),
    },
  },
  async ({ sitemap_url, limit }) => {
    try {
      const result = await getUrls(sitemap_url, limit ?? 100);
      const header =
        result.kind === "sitemapindex"
          ? `Sitemap index ${result.sitemapUrl} references ${result.totalFound} sitemap(s)` +
            ` (showing ${result.urls.length}):`
          : `Sitemap ${result.sitemapUrl} contains ${result.totalFound} URL(s)` +
            ` (showing ${result.urls.length}):`;

      const lines = result.urls.map((u) => {
        const extras: string[] = [];
        if (u.lastmod) extras.push(`lastmod=${u.lastmod}`);
        if (u.changefreq) extras.push(`changefreq=${u.changefreq}`);
        if (u.priority) extras.push(`priority=${u.priority}`);
        return extras.length > 0
          ? `${u.loc}  [${extras.join(", ")}]`
          : u.loc;
      });

      const text = [header, "", ...lines].join("\n");

      return {
        content: [
          { type: "text" as const, text },
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-sitemap] get_urls error: ${message}`);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-sitemap] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-sitemap] fatal:", err);
  process.exit(1);
});
