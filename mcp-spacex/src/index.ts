#!/usr/bin/env node
/**
 * mcp-spacex — Model Context Protocol server for the public SpaceX API.
 *
 * Exposes four tools over stdio:
 *   - latest_launch()        most recent past launch
 *   - next_launch()          next scheduled launch
 *   - get_rocket(query)      rocket details by name or id
 *   - recent_launches(limit) the N most recent past launches
 *
 * No API key required. All logs go to stderr so stdout stays a clean
 * JSON-RPC channel for the MCP transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getLatestLaunch,
  getNextLaunch,
  getRecentLaunches,
  getRocket,
  getRocketNameMap,
  SpaceXApiError,
} from "./api.js";
import { formatLaunch, formatLaunchLine, formatRocket } from "./format.js";

const server = new McpServer({
  name: "mcp-spacex",
  version: "1.0.0",
});

/** Wrap a handler so any thrown error becomes a clean MCP error result. */
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(err: unknown) {
  const message =
    err instanceof SpaceXApiError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

server.registerTool(
  "latest_launch",
  {
    title: "Latest SpaceX launch",
    description:
      "Get details about the most recent past SpaceX launch (name, date, outcome, rocket, links).",
    inputSchema: {},
  },
  async () => {
    try {
      const [launch, rocketNames] = await Promise.all([
        getLatestLaunch(),
        getRocketNameMap().catch(() => new Map<string, string>()),
      ]);
      const rocketName = launch.rocket
        ? rocketNames.get(launch.rocket)
        : undefined;
      return ok(formatLaunch(launch, rocketName));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "next_launch",
  {
    title: "Next SpaceX launch",
    description:
      "Get details about the next scheduled (upcoming) SpaceX launch.",
    inputSchema: {},
  },
  async () => {
    try {
      const [launch, rocketNames] = await Promise.all([
        getNextLaunch(),
        getRocketNameMap().catch(() => new Map<string, string>()),
      ]);
      const rocketName = launch.rocket
        ? rocketNames.get(launch.rocket)
        : undefined;
      return ok(formatLaunch(launch, rocketName));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "get_rocket",
  {
    title: "Get SpaceX rocket",
    description:
      'Get specifications for a SpaceX rocket by name or id, e.g. "Falcon 9", "Falcon Heavy", "Starship".',
    inputSchema: {
      name_or_id: z
        .string()
        .min(1)
        .describe('Rocket name (e.g. "Falcon 9") or SpaceX rocket id.'),
    },
  },
  async ({ name_or_id }) => {
    try {
      const rocket = await getRocket(name_or_id);
      return ok(formatRocket(rocket));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "recent_launches",
  {
    title: "Recent SpaceX launches",
    description:
      "List the N most recent past SpaceX launches (newest first). Default 5, max 50.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("How many recent launches to return (1-50)."),
    },
  },
  async ({ limit }) => {
    try {
      const [launches, rocketNames] = await Promise.all([
        getRecentLaunches(limit),
        getRocketNameMap().catch(() => new Map<string, string>()),
      ]);
      if (launches.length === 0) return ok("No launches found.");
      const body = launches
        .map((l) =>
          formatLaunchLine(
            l,
            l.rocket ? rocketNames.get(l.rocket) : undefined,
          ),
        )
        .join("\n");
      return ok(`${launches.length} most recent launches:\n\n${body}`);
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-spacex running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-spacex:", err);
  process.exit(1);
});
