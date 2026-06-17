#!/usr/bin/env node
/**
 * mcp-arxiv — a Model Context Protocol server exposing the public arXiv API.
 *
 * Transport: stdio. IMPORTANT: stdout is reserved for the MCP protocol stream,
 * so ALL diagnostic logging goes to stderr via console.error.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchPapers,
  getPaper,
  formatSearchResults,
  formatPaperDetail,
  ArxivApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-arxiv",
  version: "1.0.0",
});

server.registerTool(
  "search_papers",
  {
    title: "Search arXiv papers",
    description:
      "Search arXiv across all fields (title, abstract, authors, etc.) and return " +
      "a ranked list of matching papers with their ids, authors, categories and links. " +
      "Use get_paper afterwards to read a specific paper's full abstract.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe('Free-text search query, e.g. "diffusion models for protein design".'),
      max: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (1-50, default 10)."),
    },
  },
  async ({ query, max }) => {
    try {
      const papers = await searchPapers(query, { maxResults: max });
      return { content: [{ type: "text", text: formatSearchResults(query, papers) }] };
    } catch (err) {
      const msg = err instanceof ArxivApiError ? err.message : `Unexpected error: ${String(err)}`;
      console.error(`[search_papers] ${msg}`);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  },
);

server.registerTool(
  "get_paper",
  {
    title: "Get an arXiv paper",
    description:
      "Fetch full metadata and the complete abstract for a single arXiv paper by its id. " +
      'Accepts bare ids ("1706.03762"), versioned ids ("1706.03762v7"), old-style ids ' +
      '("cond-mat/0011267"), or a full arxiv.org URL.',
    inputSchema: {
      arxiv_id: z
        .string()
        .min(1)
        .describe('arXiv id or URL, e.g. "1706.03762" or "https://arxiv.org/abs/1706.03762".'),
    },
  },
  async ({ arxiv_id }) => {
    try {
      const paper = await getPaper(arxiv_id);
      return { content: [{ type: "text", text: formatPaperDetail(paper) }] };
    } catch (err) {
      const msg = err instanceof ArxivApiError ? err.message : `Unexpected error: ${String(err)}`;
      console.error(`[get_paper] ${msg}`);
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-arxiv server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-arxiv:", err);
  process.exit(1);
});
