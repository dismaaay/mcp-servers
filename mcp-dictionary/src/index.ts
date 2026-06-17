#!/usr/bin/env node
/**
 * mcp-dictionary — a Model Context Protocol server wrapping the
 * Free Dictionary API (https://dictionaryapi.dev/).
 *
 * Tools:
 *   - define(word)    : full definitions grouped by part of speech
 *   - synonyms(word)  : synonyms grouped by part of speech
 *
 * Transport: stdio. The protocol speaks over stdout; ALL logging goes to
 * stderr so it never corrupts the JSON-RPC stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  fetchEntries,
  formatDefinitions,
  formatSynonyms,
  DictionaryError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-dictionary",
  version: "1.0.0",
});

const wordSchema = z
  .string()
  .min(1, "word must not be empty")
  .max(100, "word is too long")
  .describe("The English word to look up");

server.registerTool(
  "define",
  {
    title: "Define word",
    description:
      "Look up the definitions of an English word using the Free Dictionary API. " +
      "Returns meanings grouped by part of speech, with examples and phonetics.",
    inputSchema: { word: wordSchema },
  },
  async ({ word }) => {
    try {
      const entries = await fetchEntries(word);
      return { content: [{ type: "text", text: formatDefinitions(entries) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.registerTool(
  "synonyms",
  {
    title: "Find synonyms",
    description:
      "Find synonyms for an English word using the Free Dictionary API. " +
      "Returns synonyms grouped by part of speech.",
    inputSchema: { word: wordSchema },
  },
  async ({ word }) => {
    try {
      const entries = await fetchEntries(word);
      return { content: [{ type: "text", text: formatSynonyms(entries) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

/** Convert any thrown error into a clean tool error result. */
function errorResult(err: unknown) {
  const message =
    err instanceof DictionaryError
      ? err.message
      : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr ONLY — stdout is reserved for the protocol.
  console.error("mcp-dictionary running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-dictionary:", err);
  process.exit(1);
});
