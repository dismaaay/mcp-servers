#!/usr/bin/env node
/**
 * mcp-openfda — Model Context Protocol server wrapping the openFDA API.
 *
 * Exposes three tools:
 *   - search_drug_labels(query)  : FDA structured product labels
 *   - drug_adverse_events(drug)  : FAERS adverse-event reaction summary
 *   - search_recalls(query)      : FDA drug enforcement / recall reports
 *
 * Transport: stdio. All diagnostic logging goes to stderr so stdout stays a
 * clean MCP JSON-RPC channel.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  searchDrugLabels,
  drugAdverseEvents,
  searchRecalls,
  OpenFdaError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-openfda",
  version: "1.0.0",
});

type TextResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): TextResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): TextResult {
  const message =
    err instanceof OpenFdaError
      ? err.message
      : err instanceof Error
        ? `Unexpected error: ${err.message}`
        : "Unknown error";
  return { content: [{ type: "text", text: message }], isError: true };
}

server.registerTool(
  "search_drug_labels",
  {
    title: "Search Drug Labels",
    description:
      "Search FDA structured product labeling (drug labels). Returns brand/generic " +
      "name, manufacturer, purpose, indications, warnings, and dosage for matching " +
      "drugs. Use a brand name (e.g. 'Tylenol'), generic name (e.g. 'ibuprofen'), " +
      "or condition keyword.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Drug brand name, generic name, or indication keyword."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Maximum number of labels to return (default 5)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await searchDrugLabels(query, limit ?? 5);
      if (results.length === 0) {
        return ok({ query, count: 0, results: [], note: "No labels found." });
      }
      return ok({ query, count: results.length, results });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "drug_adverse_events",
  {
    title: "Drug Adverse Events",
    description:
      "Summarize the most frequently reported adverse-event reactions for a drug " +
      "from the FDA FAERS database. Returns the total number of safety reports and " +
      "the top reported reactions with counts. Provide a drug name (brand or generic).",
    inputSchema: {
      drug: z
        .string()
        .min(1)
        .describe("Drug name (brand or generic), e.g. 'aspirin'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of top reactions to return (default 10)."),
    },
  },
  async ({ drug, limit }) => {
    try {
      const summary = await drugAdverseEvents(drug, limit ?? 10);
      return ok(summary);
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "search_recalls",
  {
    title: "Search Drug Recalls",
    description:
      "Search FDA drug enforcement (recall) reports. Returns recall number, status, " +
      "classification, recalling firm, product description, and reason for recall. " +
      "Search by drug name, firm, or recall reason keyword.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Drug name, firm, or recall reason keyword, e.g. 'metformin'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Maximum number of recalls to return (default 5)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await searchRecalls(query, limit ?? 5);
      if (results.length === 0) {
        return ok({ query, count: 0, results: [], note: "No recalls found." });
      }
      return ok({ query, count: results.length, results });
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-openfda running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-openfda:", err);
  process.exit(1);
});
