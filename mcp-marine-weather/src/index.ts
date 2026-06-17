#!/usr/bin/env node
/**
 * Marine Weather MCP server.
 *
 * Exposes the Open-Meteo Marine API (no API key required) over the Model
 * Context Protocol via stdio. All diagnostic logging goes to stderr so it
 * never corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getMarine,
  formatSnapshot,
  MarineApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-marine-weather",
  version: "1.0.0",
});

server.registerTool(
  "get_marine",
  {
    title: "Get marine weather",
    description:
      "Get current marine weather for an ocean/sea location: significant wave " +
      "height, wave direction & period, wind-wave and swell components, and sea " +
      "surface temperature. Data from the free Open-Meteo Marine API. Works only " +
      "over water; inland coordinates may return null values.",
    inputSchema: {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe("Latitude in decimal degrees (-90 to 90)."),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude in decimal degrees (-180 to 180)."),
    },
  },
  async ({ latitude, longitude }) => {
    try {
      const snapshot = await getMarine({ latitude, longitude });
      return {
        content: [
          { type: "text", text: formatSnapshot(snapshot) },
          { type: "text", text: JSON.stringify(snapshot, null, 2) },
        ],
      };
    } catch (err) {
      const message =
        err instanceof MarineApiError
          ? err.message
          : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-marine-weather running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-marine-weather:", err);
  process.exit(1);
});
