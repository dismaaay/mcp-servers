#!/usr/bin/env node
/**
 * Public Holidays MCP server.
 *
 * Exposes three tools backed by the free Nager.Date API (no key required):
 *   - holidays(year, countryCode)
 *   - next_holidays(countryCode)
 *   - is_holiday(date, countryCode)
 *
 * Transport: stdio. IMPORTANT: stdout carries the MCP protocol stream, so all
 * diagnostic logging is written to stderr only.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getHolidays,
  getNextHolidays,
  checkIsHoliday,
  HolidayApiError,
  type Holiday,
} from "./api.js";

const server = new McpServer({
  name: "mcp-public-holidays",
  version: "1.0.0",
});

/** Render a holiday as a single readable line. */
function formatHoliday(h: Holiday): string {
  const local = h.localName && h.localName !== h.name ? ` (${h.localName})` : "";
  const scope = h.global ? "" : " [regional]";
  return `${h.date}  ${h.name}${local}${scope}`;
}

/** Wrap a tool body so any error becomes a clean MCP error result. */
async function safe(
  fn: () => Promise<string>
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    const text = await fn();
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const msg =
      err instanceof HolidayApiError
        ? err.message
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

server.registerTool(
  "holidays",
  {
    title: "List public holidays",
    description:
      "List all public holidays for a given year and country. Returns each holiday's date, English name, and local name.",
    inputSchema: {
      year: z
        .number()
        .int()
        .min(1975)
        .max(2100)
        .describe("Four-digit calendar year, e.g. 2026"),
      countryCode: z
        .string()
        .describe("ISO 3166-1 alpha-2 country code, e.g. US, GB, PL, DE"),
    },
  },
  async ({ year, countryCode }) =>
    safe(async () => {
      const list = await getHolidays(year, countryCode);
      if (list.length === 0) {
        return `No public holidays found for ${countryCode.toUpperCase()} in ${year}.`;
      }
      const header = `Public holidays in ${list[0].countryCode} for ${year} (${list.length}):`;
      return [header, ...list.map(formatHoliday)].join("\n");
    })
);

server.registerTool(
  "next_holidays",
  {
    title: "Upcoming public holidays",
    description:
      "List the upcoming public holidays for a country over roughly the next 365 days, starting from today.",
    inputSchema: {
      countryCode: z
        .string()
        .describe("ISO 3166-1 alpha-2 country code, e.g. US, GB, PL, DE"),
    },
  },
  async ({ countryCode }) =>
    safe(async () => {
      const list = await getNextHolidays(countryCode);
      if (list.length === 0) {
        return `No upcoming public holidays found for ${countryCode.toUpperCase()}.`;
      }
      const header = `Upcoming public holidays in ${list[0].countryCode} (${list.length}):`;
      return [header, ...list.map(formatHoliday)].join("\n");
    })
);

server.registerTool(
  "is_holiday",
  {
    title: "Check if a date is a public holiday",
    description:
      "Check whether a specific date (YYYY-MM-DD) is a public holiday in a given country. Reports the holiday name when it is.",
    inputSchema: {
      date: z
        .string()
        .describe("Date in ISO format YYYY-MM-DD, e.g. 2026-12-25"),
      countryCode: z
        .string()
        .describe("ISO 3166-1 alpha-2 country code, e.g. US, GB, PL, DE"),
    },
  },
  async ({ date, countryCode }) =>
    safe(async () => {
      const { isHoliday, holiday } = await checkIsHoliday(date, countryCode);
      if (isHoliday && holiday) {
        const local =
          holiday.localName && holiday.localName !== holiday.name
            ? ` (local name: ${holiday.localName})`
            : "";
        return `Yes — ${date} is a public holiday in ${holiday.countryCode}: ${holiday.name}${local}.`;
      }
      return `No — ${date} is not a public holiday in ${countryCode.toUpperCase()}.`;
    })
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the protocol channel.
  console.error("mcp-public-holidays running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-public-holidays:", err);
  process.exit(1);
});
