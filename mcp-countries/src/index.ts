#!/usr/bin/env node
/**
 * mcp-countries — a Model Context Protocol server exposing world country data.
 *
 * Tools:
 *   - get_country(name)       country profile (capital, region, currency, ...)
 *   - list_by_region(region)  every country in a region/subregion
 *   - get_borders(name)       land borders, resolved to country names
 *
 * Transport: stdio. All diagnostic logging goes to STDERR; STDOUT is reserved
 * exclusively for the MCP protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  type Country,
  CountryApiError,
  getBorders,
  getCountry,
  listByRegion,
} from "./api.js";

const log = (...args: unknown[]) => console.error("[mcp-countries]", ...args);

/** Format a currency map like "Polish złoty (PLN zł)". */
function fmtCurrencies(c?: Country["currencies"]): string {
  if (!c) return "n/a";
  const parts = Object.entries(c).map(([code, cur]) => {
    const sym = cur.symbol ? ` ${cur.symbol}` : "";
    return `${cur.name ?? code} (${code}${sym})`;
  });
  return parts.length ? parts.join(", ") : "n/a";
}

/** Format a languages map like "Polish, German". */
function fmtLanguages(l?: Country["languages"]): string {
  if (!l) return "n/a";
  const vals = Object.values(l);
  return vals.length ? vals.join(", ") : "n/a";
}

/** Multi-line human-readable profile for a single country. */
function formatCountry(c: Country): string {
  const lines: string[] = [];
  const flag = c.flag ? `${c.flag} ` : "";
  lines.push(`${flag}${c.name.common} (${c.name.official})`);
  if (c.cca2 || c.cca3) {
    lines.push(`Codes: ${[c.cca2, c.cca3].filter(Boolean).join(" / ")}`);
  }
  lines.push(`Capital: ${c.capital?.length ? c.capital.join(", ") : "n/a"}`);
  lines.push(
    `Region: ${c.region ?? "n/a"}${c.subregion ? ` — ${c.subregion}` : ""}`,
  );
  if (typeof c.population === "number") {
    lines.push(`Population: ${c.population.toLocaleString("en-US")}`);
  }
  if (typeof c.area === "number") {
    lines.push(`Area: ${c.area.toLocaleString("en-US")} km²`);
  }
  lines.push(`Currencies: ${fmtCurrencies(c.currencies)}`);
  lines.push(`Languages: ${fmtLanguages(c.languages)}`);
  if (c.tld?.length) lines.push(`Internet TLD: ${c.tld.join(", ")}`);
  if (c.latlng?.length === 2) {
    lines.push(`Coordinates: ${c.latlng[0]}, ${c.latlng[1]}`);
  }
  lines.push(
    `Borders: ${c.borders?.length ? c.borders.join(", ") : "none (island or no land borders)"}`,
  );
  return lines.join("\n");
}

const server = new McpServer({
  name: "mcp-countries",
  version: "1.0.0",
});

server.registerTool(
  "get_country",
  {
    title: "Get country",
    description:
      "Look up a single country's profile by name or ISO code (e.g. " +
      '"Poland", "Japan", "DE", "BRA"). Returns capital, region, population, ' +
      "area, currencies, languages, TLD, coordinates, and bordering countries.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('Country name or ISO 3166 alpha-2/alpha-3 code, e.g. "Poland" or "PL".'),
    },
  },
  async ({ name }) => {
    try {
      const c = await getCountry(name);
      return { content: [{ type: "text", text: formatCountry(c) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_by_region",
  {
    title: "List countries by region",
    description:
      "List every country in a region or subregion (e.g. " +
      '"Europe", "Africa", "Asia", "Americas", "Oceania", or a subregion like ' +
      '"Northern Europe", "Western Africa"). Returns names with capitals and codes.',
    inputSchema: {
      region: z
        .string()
        .min(1)
        .describe('Region or subregion name, e.g. "Europe" or "Southern Asia".'),
    },
  },
  async ({ region }) => {
    try {
      const list = await listByRegion(region);
      const header = `${list.length} countries in ${region}:`;
      const body = list
        .map((c) => {
          const cap = c.capital?.length ? c.capital.join(", ") : "—";
          return `• ${c.flag ? c.flag + " " : ""}${c.name.common} (${c.cca3 ?? "?"}) — capital: ${cap}`;
        })
        .join("\n");
      return { content: [{ type: "text", text: `${header}\n${body}` }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_borders",
  {
    title: "Get country borders",
    description:
      "List the land-bordering countries of a given country (by name or ISO " +
      'code). Border ISO codes are resolved to full country names. Reports ' +
      "when a country is an island or otherwise has no land borders.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('Country name or ISO 3166 alpha-2/alpha-3 code, e.g. "France".'),
    },
  },
  async ({ name }) => {
    try {
      const { country, borders } = await getBorders(name);
      if (borders.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `${country.name.common} has no land borders (island or isolated territory).`,
            },
          ],
        };
      }
      const body = borders
        .map((b) => `• ${b.name} (${b.code})`)
        .join("\n");
      return {
        content: [
          {
            type: "text",
            text: `${country.name.common} borders ${borders.length} countries:\n${body}`,
          },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

/** Convert a thrown error into an MCP error result (isError=true). */
function errorResult(err: unknown) {
  const msg =
    err instanceof CountryApiError
      ? err.message
      : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  log("tool error:", msg);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server running on stdio");
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
