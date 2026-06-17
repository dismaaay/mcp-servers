#!/usr/bin/env node
/**
 * mcp-rss — Model Context Protocol server for RSS / Atom feeds.
 *
 * Exposes two tools over stdio:
 *   - get_feed(url, limit): fetch & parse a feed, return up to `limit` items.
 *   - latest(url):          return the single most recent item of a feed.
 *
 * All logging goes to stderr; stdout is reserved for the MCP protocol.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getFeed, latest, FeedError, type FeedItem } from "./api.js";

const server = new McpServer({
  name: "mcp-rss",
  version: "1.0.0",
});

function formatItem(item: FeedItem, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const lines = [
    `${prefix}${item.title || "(untitled)"}`,
    item.link ? `   ${item.link}` : null,
    item.published ? `   published: ${item.published}` : null,
    item.author ? `   author: ${item.author}` : null,
    item.summary ? `   ${truncate(item.summary, 280)}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function errorResult(err: unknown) {
  const message =
    err instanceof FeedError
      ? err.message
      : err instanceof Error
      ? err.message
      : String(err);
  console.error(`[mcp-rss] error: ${message}`);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

server.registerTool(
  "get_feed",
  {
    title: "Get RSS/Atom feed",
    description:
      "Fetch and parse any RSS or Atom feed by URL. Returns the feed title, " +
      "description, and a list of recent items (title, link, publish date, " +
      "author, summary). No API key required.",
    inputSchema: {
      url: z.string().url().describe("The RSS or Atom feed URL to fetch."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of items to return (1–100, default 20)."),
    },
  },
  async ({ url, limit }) => {
    try {
      const feed = await getFeed(url, limit ?? 20);
      const header = [
        `Feed: ${feed.title || "(untitled)"} [${feed.feedType}]`,
        feed.link ? `Link: ${feed.link}` : null,
        feed.description ? `Description: ${truncate(feed.description, 200)}` : null,
        `Showing ${feed.items.length} item(s).`,
        "",
      ]
        .filter(Boolean)
        .join("\n");
      const body =
        feed.items.length === 0
          ? "(no items)"
          : feed.items.map((it, i) => formatItem(it, i)).join("\n\n");

      return {
        content: [
          { type: "text", text: header + body },
          {
            type: "text",
            text: JSON.stringify(
              {
                title: feed.title,
                link: feed.link,
                description: feed.description,
                feedType: feed.feedType,
                count: feed.items.length,
                items: feed.items,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "latest",
  {
    title: "Latest feed item",
    description:
      "Fetch an RSS or Atom feed and return only its single most recent item " +
      "(title, link, publish date, author, summary). No API key required.",
    inputSchema: {
      url: z.string().url().describe("The RSS or Atom feed URL to fetch."),
    },
  },
  async ({ url }) => {
    try {
      const item = await latest(url);
      return {
        content: [
          { type: "text", text: formatItem(item) },
          { type: "text", text: JSON.stringify(item, null, 2) },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-rss] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-rss] fatal:", err);
  process.exit(1);
});
