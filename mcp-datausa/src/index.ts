#!/usr/bin/env node
/**
 * Data USA MCP server.
 *
 * Exposes the Data USA public-data API over the Model Context Protocol via
 * stdio. No API key is required. All logs go to stderr so stdout stays a clean
 * JSON-RPC channel.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getPopulation,
  query,
  GEO_LEVELS,
  POPULATION_CUBE,
  DataUsaError,
  type GeoLevel,
} from "./api.js";

const server = new McpServer({
  name: "mcp-datausa",
  version: "1.0.0",
});

/** Format an error consistently as an MCP tool error result. */
function toolError(err: unknown) {
  const message =
    err instanceof DataUsaError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

// ---------------------------------------------------------------------------
// Tool: get_population
// ---------------------------------------------------------------------------
server.registerTool(
  "get_population",
  {
    title: "Get U.S. Population",
    description:
      "Get the latest U.S. population for a geography level using the Census " +
      "Bureau ACS 1-year estimate (via Data USA). Defaults to the whole nation. " +
      "Set `geo` to break the population down by State, County, Place, Zip, MSA, " +
      "PUMA, or Congressional District.",
    inputSchema: {
      geo: z
        .enum(GEO_LEVELS)
        .optional()
        .describe(
          "Geography level to report population for. Defaults to 'Nation'."
        ),
    },
  },
  async ({ geo }) => {
    try {
      const level = (geo ?? "Nation") as GeoLevel;
      const result = await getPopulation(level);

      if (result.records.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No population data returned for geography level "${level}".`,
            },
          ],
        };
      }

      const top = result.records.slice(0, 25);
      const lines = top.map(
        (r) => `${r.name}: ${r.population.toLocaleString("en-US")}`
      );
      const more =
        result.records.length > top.length
          ? `\n…and ${result.records.length - top.length} more.`
          : "";

      const header =
        level === "Nation"
          ? `U.S. population (${result.year}):`
          : `Population by ${level} (${result.year}), top ${top.length} of ${result.records.length}:`;

      const text =
        `${header}\n${lines.join("\n")}${more}\n\n` +
        `Source: ${result.source}.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          geo: level,
          year: result.year,
          source: result.source,
          count: result.records.length,
          records: result.records,
        },
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: query
// ---------------------------------------------------------------------------
server.registerTool(
  "query",
  {
    title: "Query Data USA",
    description:
      "Run a custom Data USA query: aggregate a `measure` broken down by a " +
      "`drilldown` level. By default it uses the population cube " +
      `(${POPULATION_CUBE}) whose measure is "Population" and whose ` +
      "drilldown levels include Nation, State, County, Place, Zip, MSA, PUMA, " +
      "and Congressional District. Pass `year` (e.g. \"2024\" or \"latest\") " +
      "to filter to one year, or omit it to get every available year. Use " +
      "`cube` to target a different Data USA cube.",
    inputSchema: {
      measure: z
        .string()
        .min(1)
        .describe('Measure to aggregate, e.g. "Population".'),
      drilldown: z
        .string()
        .min(1)
        .describe('Drilldown level, e.g. "State", "County", or "Nation".'),
      year: z
        .string()
        .optional()
        .describe(
          'Optional year filter: a specific year like "2024", "latest", or omit for all years.'
        ),
      cube: z
        .string()
        .optional()
        .describe(
          `Optional cube name. Defaults to the population cube (${POPULATION_CUBE}).`
        ),
    },
  },
  async ({ measure, drilldown, year, cube }) => {
    try {
      const resp = await query(measure, drilldown, { year, cube });

      if (resp.data.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `No rows returned for measure "${measure}" by "${drilldown}"` +
                (year ? ` (year=${year})` : "") +
                ". Check that the measure and drilldown exist on the cube.",
            },
          ],
        };
      }

      const preview = resp.data.slice(0, 25);
      const lines = preview.map((row) => JSON.stringify(row));
      const more =
        resp.data.length > preview.length
          ? `\n…and ${resp.data.length - preview.length} more rows.`
          : "";

      const text =
        `${resp.data.length} row(s) for "${measure}" by "${drilldown}"` +
        (year ? ` (year=${year})` : "") +
        `:\n${lines.join("\n")}${more}`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          measure,
          drilldown,
          year: year ?? null,
          cube: cube ?? POPULATION_CUBE,
          columns: resp.columns,
          rowCount: resp.data.length,
          rows: resp.data,
        },
      };
    } catch (err) {
      return toolError(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-datausa server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-datausa:", err);
  process.exit(1);
});
