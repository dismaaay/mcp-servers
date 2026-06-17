#!/usr/bin/env node
/**
 * mcp-wikipedia
 *
 * A Model Context Protocol (MCP) server exposing Wikipedia as three tools:
 *   - search           : full-text search of articles
 *   - get_summary      : short summary of an article (REST v1 summary endpoint)
 *   - get_page_extract : full plain-text body of an article (Action API)
 *
 * Communicates over stdio. IMPORTANT: stdout carries the MCP protocol, so all
 * diagnostic logging goes to stderr via console.error.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  search,
  getSummary,
  getPageExtract,
  WikipediaError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-wikipedia",
  version: "1.0.0",
});

/** Build a standard MCP error result with text content. */
function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Map any thrown error into a friendly, user-facing message. */
function describeError(err: unknown, subject: string): string {
  if (err instanceof WikipediaError) {
    if (err.message === "PAGE_NOT_FOUND") {
      return `No Wikipedia article found for "${subject}". Try search() to find the exact title.`;
    }
    return `Wikipedia request failed: ${err.message}`;
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}

server.registerTool(
  "search",
  {
    title: "Search Wikipedia",
    description:
      "Full-text search of Wikipedia articles. Returns a ranked list of matching titles with a short snippet, word count, and URL. Use this to discover the exact article title before calling get_summary or get_page_extract.",
    inputSchema: {
      query: z.string().min(1).describe("The search query, e.g. 'Alan Turing'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (1-50). Default 5."),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await search(query, limit ?? 5);
      if (results.length === 0) {
        return {
          content: [
            { type: "text", text: `No results found for "${query}".` },
          ],
        };
      }
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}  (${r.wordcount.toLocaleString()} words)\n` +
            `   ${r.snippet}\n` +
            `   ${r.url}`
        )
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} result(s) for "${query}":\n\n${text}`,
          },
        ],
      };
    } catch (err) {
      return errorResult(describeError(err, query));
    }
  }
);

server.registerTool(
  "get_summary",
  {
    title: "Get article summary",
    description:
      "Get a concise summary (lead paragraph) of a Wikipedia article by its title, including a one-line description and the article URL. Redirects are followed automatically. Best for a quick overview.",
    inputSchema: {
      title: z
        .string()
        .min(1)
        .describe("The exact article title, e.g. 'Alan Turing'"),
    },
  },
  async ({ title }) => {
    try {
      const s = await getSummary(title);
      const parts: string[] = [`# ${s.title}`];
      if (s.description) parts.push(`*${s.description}*`);
      parts.push("");
      parts.push(s.extract || "(no summary available)");
      parts.push("");
      parts.push(`Source: ${s.url}`);
      return { content: [{ type: "text", text: parts.join("\n") }] };
    } catch (err) {
      return errorResult(describeError(err, title));
    }
  }
);

server.registerTool(
  "get_page_extract",
  {
    title: "Get full article text",
    description:
      "Get the full plain-text body of a Wikipedia article by its title (lead plus all sections, markup stripped). Redirects are followed automatically. Use this when you need the complete article content rather than just a summary.",
    inputSchema: {
      title: z
        .string()
        .min(1)
        .describe("The exact article title, e.g. 'Alan Turing'"),
    },
  },
  async ({ title }) => {
    try {
      const p = await getPageExtract(title);
      const body = p.extract.trim() || "(article has no extractable text)";
      return {
        content: [
          {
            type: "text",
            text: `# ${p.title}\n\n${body}\n\nSource: ${p.url}`,
          },
        ],
      };
    } catch (err) {
      return errorResult(describeError(err, title));
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-wikipedia server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-wikipedia:", err);
  process.exit(1);
});
