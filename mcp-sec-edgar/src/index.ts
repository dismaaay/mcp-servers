#!/usr/bin/env node
/**
 * SEC EDGAR MCP server (stdio transport).
 *
 * Exposes three tools backed by the public SEC EDGAR APIs (no API key required):
 *   - lookup_company:     resolve a ticker or name to SEC company records (CIK).
 *   - get_recent_filings: list a company's most recent EDGAR filings.
 *   - get_company_facts:  fetch headline XBRL financial facts for a company.
 *
 * All logging goes to stderr so it never corrupts the stdio JSON-RPC stream.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  lookupCompany,
  getRecentFilings,
  getCompanyFacts,
} from "./api.js";

const server = new McpServer({
  name: "mcp-sec-edgar",
  version: "1.0.0",
});

/** Wrap an async tool body with uniform error-to-MCP conversion. */
function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

server.registerTool(
  "lookup_company",
  {
    title: "Look up a company",
    description:
      "Resolve a stock ticker or company name to SEC EDGAR records, including the " +
      "zero-padded CIK number. Accepts an exact ticker (e.g. \"AAPL\") or a partial " +
      "name (e.g. \"apple\"). Returns up to `limit` matches, exact ticker matches first.",
    inputSchema: {
      ticker_or_name: z
        .string()
        .min(1)
        .describe("A stock ticker symbol or (part of) a company name."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of matches to return (default 10)."),
    },
  },
  async ({ ticker_or_name, limit }) => {
    try {
      const matches = await lookupCompany(ticker_or_name, limit ?? 10);
      if (matches.length === 0) {
        return {
          content: [
            { type: "text", text: `No SEC-registered company found matching "${ticker_or_name}".` },
          ],
        };
      }
      const lines = matches.map(
        (m) => `${m.ticker.padEnd(8)} CIK ${m.cik}  ${m.title}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `Found ${matches.length} match(es):\n${lines.join("\n")}`,
          },
          { type: "text", text: JSON.stringify(matches, null, 2) },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_recent_filings",
  {
    title: "Get recent filings",
    description:
      "List the most recent SEC EDGAR filings for a company (resolved from a ticker " +
      "or name). Each filing includes the form type (e.g. 10-K, 10-Q, 8-K, 4), the " +
      "filing date, accession number, and a direct link to the document on EDGAR.",
    inputSchema: {
      ticker_or_name: z
        .string()
        .min(1)
        .describe("A stock ticker symbol or company name."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum number of filings to return (default 10)."),
    },
  },
  async ({ ticker_or_name, limit }) => {
    try {
      const { company, filings } = await getRecentFilings(ticker_or_name, limit ?? 10);
      const header = `${company.title} (${company.ticker}, CIK ${company.cik}) — ${filings.length} recent filing(s):`;
      const lines = filings.map(
        (f) =>
          `${f.filingDate}  ${f.form.padEnd(8)} ${f.primaryDocDescription || ""}\n   ${f.url}`,
      );
      return {
        content: [
          { type: "text", text: `${header}\n${lines.join("\n")}` },
          { type: "text", text: JSON.stringify({ company, filings }, null, 2) },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "get_company_facts",
  {
    title: "Get company financial facts",
    description:
      "Fetch headline XBRL financial facts for a company (resolved from a ticker or " +
      "name) from SEC's companyfacts API. Returns the latest reported value for common " +
      "concepts such as Revenues, Net Income, Assets, Liabilities, Stockholders' Equity, " +
      "Cash, EPS, and shares outstanding.",
    inputSchema: {
      ticker_or_name: z
        .string()
        .min(1)
        .describe("A stock ticker symbol or company name."),
    },
  },
  async ({ ticker_or_name }) => {
    try {
      const { company, entityName, totalConcepts, highlights } =
        await getCompanyFacts(ticker_or_name);
      const header = `${entityName} (${company.ticker}, CIK ${company.cik}) — ${totalConcepts} XBRL concepts available. Highlights:`;
      const lines = highlights.map((h) => {
        const period = h.fiscalYear
          ? ` [FY${h.fiscalYear}${h.fiscalPeriod ? " " + h.fiscalPeriod : ""}]`
          : "";
        return `${h.label}: ${h.value.toLocaleString("en-US")} ${h.unit} (as of ${h.end})${period}`;
      });
      return {
        content: [
          {
            type: "text",
            text:
              `${header}\n${lines.join("\n")}` +
              (highlights.length === 0 ? "\n(No headline concepts reported.)" : ""),
          },
          {
            type: "text",
            text: JSON.stringify({ company, entityName, totalConcepts, highlights }, null, 2),
          },
        ],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-sec-edgar running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-sec-edgar:", err);
  process.exit(1);
});
