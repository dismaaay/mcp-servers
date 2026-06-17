#!/usr/bin/env node
/**
 * mcp-worldtime — Model Context Protocol server for world time & timezones.
 *
 * Wraps worldtimeapi.org (no API key required), with an automatic fallback to
 * timeapi.io when worldtimeapi.org is unreachable.
 *
 * Tools:
 *   - get_time(timezone)      -> current time for an IANA timezone
 *   - list_timezones(area?)   -> supported IANA timezones, optionally filtered
 *
 * Transport: stdio. All logs go to stderr; stdout is the MCP channel.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTime, listTimezones, WorldTimeError } from "./api.js";

const server = new McpServer({
  name: "mcp-worldtime",
  version: "1.0.0",
});

server.registerTool(
  "get_time",
  {
    title: "Get current time",
    description:
      "Get the current date and time for an IANA timezone (e.g. 'Europe/Warsaw', " +
      "'America/New_York', 'Asia/Tokyo', 'Etc/UTC'). Returns the ISO datetime, " +
      "UTC offset, day of week, and whether DST is active. Powered by worldtimeapi.org " +
      "(falls back to timeapi.io if unavailable).",
    inputSchema: {
      timezone: z
        .string()
        .min(1)
        .describe(
          "IANA timezone name, e.g. 'Europe/Warsaw' or 'America/New_York'."
        ),
    },
  },
  async ({ timezone }) => {
    try {
      const r = await getTime(timezone);
      const lines = [
        `Timezone:    ${r.timezone}`,
        `Datetime:    ${r.datetime}`,
        r.utc_offset ? `UTC offset:  ${r.utc_offset}` : null,
        `Day of week: ${r.day_of_week}`,
        `DST active:  ${r.dst ? "yes" : "no"}`,
        r.unixtime !== null ? `Unix time:   ${r.unixtime}` : null,
        `Source:      ${r.source}`,
      ].filter(Boolean);
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(r, null, 2) },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

server.registerTool(
  "list_timezones",
  {
    title: "List timezones",
    description:
      "List supported IANA timezones. Optionally pass an 'area' (the part before " +
      "the first slash, e.g. 'Europe', 'America', 'Asia', 'Africa') to filter the " +
      "results. Powered by worldtimeapi.org (falls back to timeapi.io if unavailable).",
    inputSchema: {
      area: z
        .string()
        .optional()
        .describe(
          "Optional area filter, e.g. 'Europe', 'America', 'Asia'. Omit for all timezones."
        ),
    },
  },
  async ({ area }) => {
    try {
      const r = await listTimezones(area);
      const preview = r.timezones.slice(0, 50);
      const header =
        `${r.count} timezone(s)` +
        (area ? ` in area "${area}"` : "") +
        ` (source: ${r.source})`;
      const more =
        r.timezones.length > preview.length
          ? `\n…and ${r.timezones.length - preview.length} more.`
          : "";
      return {
        content: [
          { type: "text", text: `${header}\n${preview.join("\n")}${more}` },
          { type: "text", text: JSON.stringify(r, null, 2) },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

/** Convert any thrown error into an MCP tool error result. */
function toolError(err: unknown) {
  const message =
    err instanceof WorldTimeError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`[mcp-worldtime] tool error: ${message}`);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-worldtime] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-worldtime] fatal:", err);
  process.exit(1);
});
