#!/usr/bin/env node
/**
 * mcp-earthquakes
 *
 * A Model Context Protocol server that exposes real-time earthquake data from
 * the USGS FDSN event web service (no API key required).
 *
 * Transport: stdio. The MCP protocol owns stdout; ALL human/diagnostic logging
 * goes to stderr via console.error.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  recent,
  byRegion,
  formatQuakes,
  UsgsApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-earthquakes",
  version: "1.0.0",
});

server.registerTool(
  "recent",
  {
    title: "Recent earthquakes",
    description:
      "List the most recent earthquakes worldwide (newest first) from USGS. " +
      "Optionally filter by a minimum magnitude and cap the number of results.",
    inputSchema: {
      minMagnitude: z
        .number()
        .min(-1)
        .max(10)
        .optional()
        .describe("Only return quakes at or above this magnitude (e.g. 4.5)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of events to return (default 10, max 500)."),
    },
  },
  async ({ minMagnitude, limit }) => {
    try {
      const quakes = await recent({ minMagnitude, limit });
      const header =
        `Recent earthquakes` +
        (minMagnitude !== undefined ? ` (M${minMagnitude}+)` : "") +
        ` — ${quakes.length} event(s), newest first`;
      return { content: [{ type: "text", text: formatQuakes(quakes, header) }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "by_region",
  {
    title: "Earthquakes by region",
    description:
      "List earthquakes within a circular region around a center point " +
      "(latitude/longitude) and radius in kilometers, newest first. " +
      "Optionally filter by minimum magnitude.",
    inputSchema: {
      lat: z
        .number()
        .min(-90)
        .max(90)
        .describe("Center latitude in decimal degrees."),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe("Center longitude in decimal degrees."),
      radiuskm: z
        .number()
        .min(0)
        .max(20001)
        .describe("Search radius from the center point, in kilometers."),
      minMagnitude: z
        .number()
        .min(-1)
        .max(10)
        .optional()
        .describe("Only return quakes at or above this magnitude."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Maximum number of events to return (default 20, max 500)."),
    },
  },
  async ({ lat, lon, radiuskm, minMagnitude, limit }) => {
    try {
      const quakes = await byRegion({
        lat,
        lon,
        radiusKm: radiuskm,
        minMagnitude,
        limit,
      });
      const header =
        `Earthquakes within ${radiuskm} km of (${lat}, ${lon})` +
        (minMagnitude !== undefined ? `, M${minMagnitude}+` : "") +
        ` — ${quakes.length} event(s), newest first`;
      return { content: [{ type: "text", text: formatQuakes(quakes, header) }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

/** Convert any thrown error into a clean, user-facing MCP tool error result. */
function toolError(err: unknown) {
  const message =
    err instanceof UsgsApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`[mcp-earthquakes] tool error: ${message}`);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-earthquakes] server running on stdio");
}

main().catch((err) => {
  console.error("[mcp-earthquakes] fatal:", err);
  process.exit(1);
});
