#!/usr/bin/env node
/**
 * mcp-geocode — a Model Context Protocol server that wraps the OpenStreetMap
 * Nominatim geocoding API.
 *
 * Tools:
 *   - geocode(query):       address / place name  ->  coordinates + details
 *   - reverse(lat, lon):    coordinates           ->  nearest address
 *
 * Transport: stdio. The JSON-RPC protocol owns stdout; ALL human/diagnostic
 * logging goes to stderr via console.error.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  geocode,
  reverse,
  formatPlace,
  NominatimError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-geocode",
  version: "1.0.0",
});

server.registerTool(
  "geocode",
  {
    title: "Geocode an address or place",
    description:
      "Forward geocoding: convert a free-form query (street address, city, " +
      "landmark, point of interest) into geographic coordinates and address " +
      "details using OpenStreetMap Nominatim. Returns up to `limit` ranked " +
      "matches.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Free-form place query, e.g. 'Eiffel Tower' or '1600 Pennsylvania Ave NW, Washington DC'"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of results to return (default 5)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await geocode(query, { limit });
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}".`,
            },
          ],
        };
      }
      const body = results
        .map((p, i) => formatPlace(p, i + 1))
        .join("\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} result(s) for "${query}":\n\n${body}`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.registerTool(
  "reverse",
  {
    title: "Reverse geocode coordinates",
    description:
      "Reverse geocoding: convert a latitude/longitude pair into the nearest " +
      "known address / place using OpenStreetMap Nominatim.",
    inputSchema: {
      lat: z
        .number()
        .min(-90)
        .max(90)
        .describe("Latitude in decimal degrees (-90..90)"),
      lon: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude in decimal degrees (-180..180)"),
    },
  },
  async ({ lat, lon }) => {
    try {
      const place = await reverse(lat, lon);
      return {
        content: [
          {
            type: "text",
            text: `Nearest place to ${lat}, ${lon}:\n\n${formatPlace(place)}`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

function toolError(err: unknown) {
  const message =
    err instanceof NominatimError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`[mcp-geocode] tool error: ${message}`);
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-geocode] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-geocode] fatal:", err);
  process.exit(1);
});
