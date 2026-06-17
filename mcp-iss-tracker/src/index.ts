#!/usr/bin/env node
/**
 * mcp-iss-tracker
 *
 * A Model Context Protocol (MCP) server that exposes two tools:
 *   - iss_position()    : live ISS coordinates, altitude, and velocity
 *   - people_in_space() : everyone currently in orbit
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getIssPosition, getPeopleInSpace } from "./api.js";

const server = new McpServer({
  name: "mcp-iss-tracker",
  version: "1.0.0",
});

server.registerTool(
  "iss_position",
  {
    title: "ISS Position",
    description:
      "Get the real-time position of the International Space Station: " +
      "latitude, longitude, altitude (km), orbital velocity (km/h), whether " +
      "it is currently sunlit, and the timestamp of the reading. Data from " +
      "wheretheiss.at. Takes no arguments.",
    inputSchema: {},
  },
  async () => {
    try {
      const pos = await getIssPosition();
      const summary =
        `The ISS is at ${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)} ` +
        `(lat, lon), altitude ${pos.altitudeKm.toFixed(1)} km, ` +
        `traveling ${pos.velocityKmh.toFixed(0)} km/h. ` +
        `It is currently ${pos.visibility}. ` +
        `Reading as of ${pos.timestampIso}.`;
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(pos, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          { type: "text", text: `Failed to fetch ISS position: ${message}` },
        ],
      };
    }
  }
);

server.registerTool(
  "people_in_space",
  {
    title: "People In Space",
    description:
      "Get the list of all people currently in space, including each " +
      "person's name and the spacecraft/station they are aboard, plus the " +
      "total count and a breakdown by craft. Data from Open Notify. " +
      "Takes no arguments.",
    inputSchema: {},
  },
  async () => {
    try {
      const data = await getPeopleInSpace();
      const roster = data.people
        .map((p) => `- ${p.name} (${p.craft})`)
        .join("\n");
      const breakdown = Object.entries(data.byCraft)
        .map(([craft, n]) => `${craft}: ${n}`)
        .join(", ");
      const summary =
        `There are ${data.number} people in space right now ` +
        `(${breakdown}):\n${roster}`;
      return {
        content: [
          { type: "text", text: summary },
          { type: "text", text: JSON.stringify(data, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to fetch people in space: ${message}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-iss-tracker running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-iss-tracker:", err);
  process.exit(1);
});
