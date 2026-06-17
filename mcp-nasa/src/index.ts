#!/usr/bin/env node
/**
 * mcp-nasa — a Model Context Protocol server exposing NASA's open APIs.
 *
 * Tools:
 *   - apod(date?)                 Astronomy Picture of the Day
 *   - near_earth_objects(date?)   Near-earth asteroids for a given day (NeoWs)
 *
 * Transport: stdio. All human-readable logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getApod,
  getNearEarthObjects,
  flattenNeoFeed,
  NasaApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-nasa",
  version: "1.0.0",
});

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .optional()
  .describe("Date in YYYY-MM-DD format. Defaults to today if omitted.");

/** Wrap a handler so NasaApiError becomes a clean MCP error result. */
function toErrorResult(err: unknown) {
  const message =
    err instanceof NasaApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

server.registerTool(
  "apod",
  {
    title: "Astronomy Picture of the Day",
    description:
      "Fetch NASA's Astronomy Picture of the Day (APOD), including the title, " +
      "an expert explanation, the image/video URL and copyright. Pass an " +
      "optional date (YYYY-MM-DD) to get the picture for a specific day; " +
      "omit it for today's picture.",
    inputSchema: { date: dateInput },
  },
  async ({ date }) => {
    try {
      const apod = await getApod(date);
      const lines = [
        `${apod.title} (${apod.date})`,
        apod.copyright ? `Copyright: ${apod.copyright.replace(/\s+/g, " ").trim()}` : null,
        `Media type: ${apod.media_type}`,
        apod.url ? `URL: ${apod.url}` : null,
        apod.hdurl ? `HD URL: ${apod.hdurl}` : null,
        "",
        apod.explanation,
      ].filter(Boolean);
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(apod, null, 2) },
        ],
      };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "near_earth_objects",
  {
    title: "Near-Earth Objects (Asteroids)",
    description:
      "List near-earth objects (asteroids) whose closest approach to Earth " +
      "occurs on a given date, via NASA's NeoWs feed. For each object you get " +
      "its name, estimated diameter, closest miss distance, relative velocity " +
      "and whether it is flagged potentially hazardous. Pass an optional date " +
      "(YYYY-MM-DD); omit it for today.",
    inputSchema: { date: dateInput },
  },
  async ({ date }) => {
    try {
      const feed = await getNearEarthObjects(date);
      const { date: day, count, objects } = flattenNeoFeed(feed);
      const header = `${count} near-earth object(s) approaching on ${day} (sorted by closest miss distance):`;
      const rows = objects.map((o, i) => {
        const ca = o.close_approach_data?.[0];
        const dMin = o.estimated_diameter?.meters?.estimated_diameter_min;
        const dMax = o.estimated_diameter?.meters?.estimated_diameter_max;
        return [
          `${i + 1}. ${o.name}${o.is_potentially_hazardous_asteroid ? "  [POTENTIALLY HAZARDOUS]" : ""}`,
          `   diameter: ${dMin?.toFixed(1)}–${dMax?.toFixed(1)} m`,
          `   miss distance: ${Number(ca?.miss_distance?.kilometers ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} km (${Number(ca?.miss_distance?.lunar ?? 0).toFixed(1)} lunar distances)`,
          `   velocity: ${Number(ca?.relative_velocity?.kilometers_per_hour ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} km/h`,
        ].join("\n");
      });
      const summary = [header, "", ...rows].join("\n");
      return {
        content: [
          { type: "text", text: summary },
          {
            type: "text",
            text: JSON.stringify({ date: day, count, objects }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-nasa running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-nasa:", err);
  process.exit(1);
});
