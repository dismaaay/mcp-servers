#!/usr/bin/env node
/**
 * Wayback Machine MCP server.
 *
 * Exposes the Internet Archive Wayback Machine over the Model Context Protocol
 * via stdio. No API key required.
 *
 * Tools:
 *   - get_snapshot(url, timestamp?) : find the archived copy closest to a date
 *   - list_snapshots(url, limit)    : list historical captures of a URL
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getSnapshot, listSnapshots, type Snapshot } from "./api.js";

const server = new McpServer({
  name: "mcp-wayback",
  version: "1.0.0",
});

function snapshotToText(s: Snapshot): string {
  const lines = [
    `Original URL: ${s.url}`,
    `Archived copy: ${s.archivedUrl}`,
    `Captured: ${s.isoDate} (timestamp ${s.timestamp})`,
    `HTTP status at capture: ${s.status}`,
  ];
  if (s.mimetype) lines.push(`Content type: ${s.mimetype}`);
  return lines.join("\n");
}

server.registerTool(
  "get_snapshot",
  {
    title: "Get Wayback snapshot",
    description:
      "Find the Internet Archive Wayback Machine snapshot of a URL closest to a given date. " +
      "If no timestamp is supplied, returns the most relevant archived copy. " +
      "Returns the original URL, a direct link to the archived copy, the capture time, and the HTTP status.",
    inputSchema: {
      url: z
        .string()
        .min(1)
        .describe("The URL to look up, e.g. 'example.com' or 'https://nytimes.com'"),
      timestamp: z
        .string()
        .optional()
        .describe(
          "Optional target date as yyyyMMddHHmmss (any leading portion is fine, e.g. '2010', '20100101'). The snapshot closest to this date is returned.",
        ),
    },
  },
  async ({ url, timestamp }) => {
    try {
      const snap = await getSnapshot(url, timestamp);
      if (!snap) {
        return {
          content: [
            {
              type: "text",
              text: `No Wayback Machine snapshot found for "${url}". The URL may never have been archived.`,
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: snapshotToText(snap) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching snapshot: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "list_snapshots",
  {
    title: "List Wayback snapshots",
    description:
      "List historical Internet Archive Wayback Machine snapshots (captures) of a URL, " +
      "newest information drawn from the CDX capture index. Returns up to `limit` captures, " +
      "each with its capture time, HTTP status, content type, and a direct archived link.",
    inputSchema: {
      url: z
        .string()
        .min(1)
        .describe("The URL to list captures for, e.g. 'example.com'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(10)
        .describe("Maximum number of captures to return (1-1000, default 10)."),
    },
  },
  async ({ url, limit }) => {
    try {
      const snaps = await listSnapshots(url, limit);
      if (snaps.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No captures found in the Wayback Machine for "${url}".`,
            },
          ],
        };
      }
      const body = snaps
        .map((s, i) => `${i + 1}. ${snapshotToText(s)}`)
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${snaps.length} capture(s) for "${url}":\n\n${body}`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error listing snapshots: ${message}` }],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the MCP protocol stream.
  console.error("mcp-wayback running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-wayback:", err);
  process.exit(1);
});
