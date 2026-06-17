#!/usr/bin/env node
/**
 * mcp-dns — DNS Lookup MCP server.
 *
 * Exposes two tools over stdio:
 *   - resolve(name, type): forward DNS lookup (A, AAAA, MX, TXT, ...)
 *   - reverse(ip):         reverse DNS (PTR) lookup for IPv4/IPv6
 *
 * Backed by Cloudflare DNS-over-HTTPS (application/dns-json), no API key.
 * All diagnostic logging goes to stderr so stdout stays clean for the
 * MCP JSON-RPC protocol.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  resolve as dnsResolve,
  reverse as dnsReverse,
  SUPPORTED_TYPES,
} from "./api.js";

const server = new McpServer({
  name: "mcp-dns",
  version: "1.0.0",
});

server.registerTool(
  "resolve",
  {
    title: "Resolve DNS records",
    description:
      "Perform a forward DNS lookup for a domain name using Cloudflare " +
      "DNS-over-HTTPS. Returns matching records (e.g. A, AAAA, MX, TXT, " +
      "CNAME, NS) with their TTLs. Supported types: " +
      SUPPORTED_TYPES.join(", ") +
      ". Defaults to A.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe("Domain name to resolve, e.g. \"example.com\""),
      type: z
        .enum(SUPPORTED_TYPES)
        .default("A")
        .describe("DNS record type to query (default: A)"),
    },
  },
  async ({ name, type }) => {
    try {
      const result = await dnsResolve(name, type);

      if (result.answers.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `No ${result.type} records found for ${result.name} ` +
                `(status: ${result.status}).`,
            },
          ],
        };
      }

      const lines = result.answers.map(
        (a) => `${a.type}\t${a.name}\tTTL=${a.TTL}\t${a.data}`,
      );
      const text =
        `DNS ${result.type} records for ${result.name} ` +
        `(status: ${result.status}):\n` +
        lines.join("\n") +
        `\n\n${JSON.stringify(result, null, 2)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-dns] resolve error: ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  },
);

server.registerTool(
  "reverse",
  {
    title: "Reverse DNS lookup",
    description:
      "Perform a reverse DNS (PTR) lookup for an IPv4 or IPv6 address using " +
      "Cloudflare DNS-over-HTTPS. Returns the hostname(s) the address maps " +
      "to, e.g. 1.1.1.1 -> one.one.one.one.",
    inputSchema: {
      ip: z
        .string()
        .min(1)
        .describe("IPv4 or IPv6 address, e.g. \"1.1.1.1\" or \"2606:4700:4700::1111\""),
    },
  },
  async ({ ip }) => {
    try {
      const result = await dnsReverse(ip);

      if (result.hostnames.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No PTR (hostname) records found for ${result.ip}.`,
            },
          ],
        };
      }

      const text =
        `Reverse DNS for ${result.ip} (PTR query: ${result.ptr}):\n` +
        result.hostnames.map((h) => `  ${h}`).join("\n") +
        `\n\n${JSON.stringify(result, null, 2)}`;

      return { content: [{ type: "text", text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp-dns] reverse error: ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-dns] DNS Lookup MCP server running on stdio");
}

main().catch((err) => {
  console.error("[mcp-dns] fatal error:", err);
  process.exit(1);
});
