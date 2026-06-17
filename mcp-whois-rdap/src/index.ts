#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  lookupDomain,
  formatDomainInfo,
  RdapError,
  type DomainInfo,
} from "./api.js";

const server = new McpServer({
  name: "mcp-whois-rdap",
  version: "1.0.0",
});

server.registerTool(
  "lookup_domain",
  {
    title: "Domain RDAP/WHOIS Lookup",
    description:
      "Look up registration data (WHOIS/RDAP) for a domain name using the " +
      "global rdap.org bootstrap service. Returns registrar, status, " +
      "nameservers, DNSSEC, key registration/expiry events, and the abuse " +
      "contact. No API key required. Example input: \"example.com\".",
    inputSchema: {
      domain: z
        .string()
        .min(1)
        .describe(
          "The domain name to look up, e.g. \"example.com\" or \"google.co.uk\". " +
            "URLs are accepted and reduced to their host."
        ),
    },
  },
  async ({ domain }) => {
    try {
      const info: DomainInfo = await lookupDomain(domain);
      const text = formatDomainInfo(info);
      return {
        content: [{ type: "text", text }],
        // Structured data for clients that can consume it.
        structuredContent: {
          domain: info.domain,
          handle: info.handle,
          registrar: info.registrar,
          registrarIanaId: info.registrarIanaId,
          status: info.status,
          nameservers: info.nameservers,
          secureDns: info.secureDns,
          abuseEmail: info.abuseEmail,
          events: info.events,
          rdapServer: info.rdapServer,
        },
      };
    } catch (err) {
      const message =
        err instanceof RdapError
          ? `RDAP lookup failed (${err.code}): ${err.message}`
          : `Unexpected error: ${
              err instanceof Error ? err.message : String(err)
            }`;
      console.error(`[mcp-whois-rdap] ${message}`);
      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is reserved for the JSON-RPC protocol stream.
  console.error("mcp-whois-rdap running on stdio");
}

main().catch((err) => {
  console.error("[mcp-whois-rdap] fatal:", err);
  process.exit(1);
});
