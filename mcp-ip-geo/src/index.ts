#!/usr/bin/env node
/**
 * mcp-ip-geo — an MCP server exposing IP geolocation tools backed by ipapi.co.
 *
 * IMPORTANT: stdout is reserved for the JSON-RPC protocol stream. All human
 * logging MUST go to stderr (console.error), never stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { lookupIp, myLocation, formatGeo, GeoError } from "./api.js";

const server = new McpServer({
  name: "mcp-ip-geo",
  version: "1.0.0",
});

server.registerTool(
  "lookup_ip",
  {
    title: "Look up IP geolocation",
    description:
      "Geolocate a specific IPv4 or IPv6 address. Returns city, region, country, " +
      "coordinates, timezone, currency, and network/ASN info using ipapi.co.",
    inputSchema: {
      ip: z
        .string()
        .min(1)
        .describe("The IPv4 or IPv6 address to look up, e.g. 8.8.8.8 or 1.1.1.1"),
    },
  },
  async ({ ip }) => {
    try {
      const geo = await lookupIp(ip);
      return { content: [{ type: "text", text: formatGeo(geo) }] };
    } catch (err) {
      const msg = err instanceof GeoError ? err.message : `Unexpected error: ${String(err)}`;
      return { isError: true, content: [{ type: "text", text: `Lookup failed — ${msg}` }] };
    }
  },
);

server.registerTool(
  "my_location",
  {
    title: "Look up my location",
    description:
      "Geolocate the public IP address this server is calling from. Returns the same " +
      "rich geolocation details as lookup_ip for the caller's own egress IP.",
    inputSchema: {},
  },
  async () => {
    try {
      const geo = await myLocation();
      return { content: [{ type: "text", text: formatGeo(geo) }] };
    } catch (err) {
      const msg = err instanceof GeoError ? err.message : `Unexpected error: ${String(err)}`;
      return { isError: true, content: [{ type: "text", text: `Lookup failed — ${msg}` }] };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-ip-geo running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-ip-geo:", err);
  process.exit(1);
});
