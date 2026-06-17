#!/usr/bin/env node
/**
 * mcp-url-metadata
 *
 * A Model Context Protocol server that fetches any URL and extracts its
 * <title>, meta description, and OpenGraph / Twitter card tags. No API key.
 *
 * Transport: stdio. All logging goes to stderr so it never corrupts the
 * JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getMetadata, UrlMetadataError, type UrlMetadata } from "./api.js";

const server = new McpServer({
  name: "mcp-url-metadata",
  version: "1.0.0",
});

/** Render extracted metadata as a compact, human-readable summary. */
function renderSummary(m: UrlMetadata): string {
  const lines: string[] = [];
  lines.push(`URL:         ${m.url}`);
  lines.push(`HTTP status: ${m.status}`);
  if (m.title) lines.push(`Title:       ${m.title}`);
  if (m.description) lines.push(`Description: ${m.description}`);
  if (m.siteName) lines.push(`Site name:   ${m.siteName}`);
  if (m.canonical) lines.push(`Canonical:   ${m.canonical}`);
  if (m.image) lines.push(`Image:       ${m.image}`);

  const ogKeys = Object.keys(m.openGraph);
  if (ogKeys.length) {
    lines.push("");
    lines.push("OpenGraph:");
    for (const k of ogKeys) lines.push(`  og:${k} = ${m.openGraph[k]}`);
  }

  const twKeys = Object.keys(m.twitter);
  if (twKeys.length) {
    lines.push("");
    lines.push("Twitter card:");
    for (const k of twKeys) lines.push(`  twitter:${k} = ${m.twitter[k]}`);
  }

  if (!m.title && !m.description && !ogKeys.length && !twKeys.length) {
    lines.push("");
    lines.push("(No title, description, or social metadata found on this page.)");
  }

  return lines.join("\n");
}

server.registerTool(
  "get_metadata",
  {
    title: "Get URL Metadata",
    description:
      "Fetch any web page and extract its metadata: <title>, meta description, " +
      "OpenGraph (og:*) tags, Twitter card tags, canonical URL, and a best-guess " +
      "preview image and site name. No API key required. Returns both a readable " +
      "summary and structured JSON.",
    inputSchema: {
      url: z
        .string()
        .min(1)
        .describe(
          "The URL to fetch (e.g. https://example.com). If the scheme is " +
            "omitted, https:// is assumed.",
        ),
    },
  },
  async ({ url }) => {
    try {
      const meta = await getMetadata(url);
      const summary = renderSummary(meta);
      console.error(
        `[mcp-url-metadata] get_metadata ok: ${meta.url} (HTTP ${meta.status})`,
      );
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(meta, null, 2) },
        ],
      };
    } catch (err) {
      const message =
        err instanceof UrlMetadataError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`[mcp-url-metadata] get_metadata error: ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-url-metadata] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-url-metadata] fatal:", err);
  process.exit(1);
});
