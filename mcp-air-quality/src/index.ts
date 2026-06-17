#!/usr/bin/env node
/**
 * mcp-air-quality
 *
 * A Model Context Protocol (MCP) server that exposes real-time air quality
 * data from the free, no-key Open-Meteo Air Quality API over stdio.
 *
 * All diagnostic logging goes to stderr; stdout is reserved for the MCP
 * JSON-RPC protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getAirQuality, formatAirQuality } from "./api.js";

const server = new McpServer({
  name: "mcp-air-quality",
  version: "1.0.0",
});

server.registerTool(
  "get_air_quality",
  {
    title: "Get Air Quality",
    description:
      "Get current air quality for a geographic coordinate using the Open-Meteo " +
      "Air Quality API (no API key required). Returns the European AQI and US AQI " +
      "with descriptive bands, plus concentrations of PM2.5, PM10, carbon monoxide, " +
      "nitrogen dioxide, sulphur dioxide and ozone.",
    inputSchema: {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe("Latitude in decimal degrees, between -90 and 90."),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitude in decimal degrees, between -180 and 180."),
    },
  },
  async ({ latitude, longitude }) => {
    try {
      const result = await getAirQuality(latitude, longitude);
      return {
        content: [
          { type: "text", text: formatAirQuality(result) },
          {
            type: "text",
            text: "\nStructured data:\n" + JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-air-quality] get_air_quality failed: ${message}`);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch air quality: ${message}`,
          },
        ],
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-air-quality] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-air-quality] fatal error:", err);
  process.exit(1);
});
