#!/usr/bin/env node
/**
 * mcp-hackernews — a Model Context Protocol server for Hacker News.
 *
 * Exposes three tools over stdio:
 *   - get_top_stories(limit)
 *   - get_story(id)
 *   - search_stories(query, limit?)
 *
 * IMPORTANT: stdout is the MCP protocol channel. All human-readable logs
 * MUST go to stderr (console.error), never stdout (console.log).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getTopStories,
  getStory,
  searchStories,
  hnItemUrl,
  type HnItem,
} from "./api.js";

const SERVER_NAME = "mcp-hackernews";
const SERVER_VERSION = "1.0.0";

/** Format a unix-seconds timestamp as a readable UTC string. */
function fmtTime(unixSeconds?: number): string {
  if (!unixSeconds) return "unknown time";
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Render a single HN story/item as a compact, readable line block. */
function renderItem(it: HnItem, index?: number): string {
  const prefix = index != null ? `${index}. ` : "";
  const title = it.title ?? (it.type === "comment" ? "(comment)" : "(untitled)");
  const lines: string[] = [`${prefix}${title}`];
  const meta: string[] = [];
  if (it.score != null) meta.push(`${it.score} points`);
  if (it.by) meta.push(`by ${it.by}`);
  if (it.descendants != null) meta.push(`${it.descendants} comments`);
  if (it.time) meta.push(fmtTime(it.time));
  if (meta.length) lines.push(`   ${meta.join(" | ")}`);
  if (it.url) lines.push(`   ${it.url}`);
  lines.push(`   HN: ${hnItemUrl(it.id)}`);
  if (it.text) {
    // Strip HTML tags for a readable plain-text preview.
    const plain = it.text.replace(/<[^>]+>/g, "").replace(/&#x2F;/g, "/").trim();
    lines.push(`   ${plain.length > 280 ? plain.slice(0, 280) + "…" : plain}`);
  }
  return lines.join("\n");
}

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

server.registerTool(
  "get_top_stories",
  {
    title: "Get top Hacker News stories",
    description:
      "Fetch the current front-page top stories from Hacker News, in ranking order. " +
      "Returns titles, scores, authors, comment counts, and links.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10)
        .describe("How many top stories to return (1-100, default 10)."),
    },
  },
  async ({ limit }) => {
    try {
      const stories = await getTopStories(limit ?? 10);
      if (stories.length === 0) {
        return { content: [{ type: "text", text: "No top stories were returned." }] };
      }
      const body = stories
        .map((s, i) => renderItem(s, i + 1))
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Top ${stories.length} Hacker News stories:\n\n${body}`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching top stories: ${msg}` }],
      };
    }
  },
);

server.registerTool(
  "get_story",
  {
    title: "Get a Hacker News item by id",
    description:
      "Fetch a single Hacker News item (story, comment, job, or poll) by its numeric id. " +
      "Returns full details including title, score, author, text, and links.",
    inputSchema: {
      id: z
        .number()
        .int()
        .positive()
        .describe("The numeric Hacker News item id (e.g. 8863)."),
    },
  },
  async ({ id }) => {
    try {
      const item = await getStory(id);
      const header = `Hacker News item #${item.id} (${item.type ?? "item"})`;
      return {
        content: [
          { type: "text", text: `${header}\n\n${renderItem(item)}` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching item ${id}: ${msg}` }],
      };
    }
  },
);

server.registerTool(
  "search_stories",
  {
    title: "Search Hacker News stories",
    description:
      "Full-text search across Hacker News stories via the Algolia API. " +
      "Returns matching stories sorted by relevance, with scores, authors, and links.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search terms, e.g. 'rust async' or 'show hn'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("How many results to return (1-50, default 10)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const hits = await searchStories(query, limit ?? 10);
      if (hits.length === 0) {
        return {
          content: [
            { type: "text", text: `No Hacker News stories found for "${query}".` },
          ],
        };
      }
      const body = hits
        .map((h, i) => {
          const lines = [
            `${i + 1}. ${h.title}`,
            `   ${h.points} points | by ${h.author} | ${h.numComments} comments | ${h.createdAt.slice(0, 10)}`,
          ];
          if (h.url) lines.push(`   ${h.url}`);
          lines.push(`   HN: ${h.hnUrl}`);
          return lines.join("\n");
        })
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${hits.length} Hacker News stories for "${query}":\n\n${body}`,
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error searching for "${query}": ${msg}` }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal error starting mcp-hackernews:", err);
  process.exit(1);
});
