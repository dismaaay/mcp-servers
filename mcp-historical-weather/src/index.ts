#!/usr/bin/env node
/**
 * Historical Weather MCP server.
 *
 * Exposes the Open-Meteo Archive (https://archive-api.open-meteo.com/v1/archive)
 * as a Model Context Protocol tool. No API key required.
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never corrupts
 * the JSON-RPC protocol stream on stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getHistory } from "./api.js";

const server = new McpServer({
  name: "mcp-historical-weather",
  version: "1.0.0",
});

server.registerTool(
  "get_history",
  {
    title: "Get Historical Weather",
    description:
      "Fetch historical daily weather (temperature min/max/mean, precipitation, rain, snowfall, wind) " +
      "for a geographic coordinate over an inclusive date range, using the free Open-Meteo Archive API. " +
      "Data is available from 1940 to ~5 days ago. Dates must be in YYYY-MM-DD format.",
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
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD")
        .describe("Inclusive start date in YYYY-MM-DD format."),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD")
        .describe("Inclusive end date in YYYY-MM-DD format."),
      temperature_unit: z
        .enum(["celsius", "fahrenheit"])
        .optional()
        .describe("Temperature unit. Defaults to celsius."),
    },
  },
  async ({ latitude, longitude, start_date, end_date, temperature_unit }) => {
    try {
      const result = await getHistory({
        latitude,
        longitude,
        start_date,
        end_date,
        temperature_unit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch historical weather: ${message}`,
          },
        ],
      };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-historical-weather running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-historical-weather:", err);
  process.exit(1);
});
