#!/usr/bin/env node
/**
 * index.ts — MCP server entrypoint for mcp-dev-utils.
 *
 * Wires the pure logic in ./api.ts to the Model Context Protocol over stdio.
 * All diagnostic logging goes to stderr ONLY — stdout is reserved for the
 * JSON-RPC protocol stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  generateUuid,
  hashText,
  base64,
  jwtDecode,
  unixToIso,
  isoToUnix,
  SUPPORTED_HASH_ALGOS,
} from "./api.js";

const server = new McpServer({
  name: "mcp-dev-utils",
  version: "1.0.0",
});

/** Helper: format any value as a pretty JSON text content block. */
function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

/** Helper: format a plain string content block. */
function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** Helper: standardized error content (isError so clients can detect it). */
function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

// ---------------------------------------------------------------------------
// uuid
// ---------------------------------------------------------------------------
server.registerTool(
  "uuid",
  {
    title: "Generate UUID",
    description:
      "Generate a UUID. version='v4' (random, default) or 'v7' (time-ordered, RFC 9562).",
    inputSchema: {
      version: z
        .enum(["v4", "v7"])
        .optional()
        .describe("UUID version: 'v4' (random, default) or 'v7' (time-ordered)."),
    },
  },
  async ({ version }) => {
    try {
      const id = generateUuid(version ?? "v4");
      return textContent(id);
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// hash
// ---------------------------------------------------------------------------
server.registerTool(
  "hash",
  {
    title: "Hash text",
    description: `Compute a cryptographic hash of UTF-8 text and return the hex digest. algo one of: ${SUPPORTED_HASH_ALGOS.join(", ")} (default sha256).`,
    inputSchema: {
      text: z.string().describe("The UTF-8 text to hash."),
      algo: z
        .enum(SUPPORTED_HASH_ALGOS)
        .optional()
        .describe(`Hash algorithm (default sha256). One of: ${SUPPORTED_HASH_ALGOS.join(", ")}.`),
    },
  },
  async ({ text, algo }) => {
    try {
      const chosen = algo ?? "sha256";
      const digest = hashText(text, chosen);
      return jsonContent({ algo: chosen, hex: digest, length: digest.length });
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// base64
// ---------------------------------------------------------------------------
server.registerTool(
  "base64",
  {
    title: "Base64 encode/decode",
    description:
      "Base64 encode or decode UTF-8 text. mode='encode' (text->base64, default) or 'decode' (base64->text).",
    inputSchema: {
      text: z.string().describe("Input text. For encode: plain UTF-8. For decode: base64."),
      mode: z
        .enum(["encode", "decode"])
        .optional()
        .describe("'encode' (default) or 'decode'."),
    },
  },
  async ({ text, mode }) => {
    try {
      const chosen = mode ?? "encode";
      const result = base64(text, chosen);
      return jsonContent({ mode: chosen, result });
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// jwt_decode
// ---------------------------------------------------------------------------
server.registerTool(
  "jwt_decode",
  {
    title: "Decode JWT",
    description:
      "Decode (NOT verify) a JWT into its header, payload, and signature segment. Surfaces common time claims (iat/exp/nbf) and expiry status. No signature verification is performed.",
    inputSchema: {
      token: z.string().describe("The JWT string (header.payload.signature)."),
    },
  },
  async ({ token }) => {
    try {
      const decoded = jwtDecode(token);
      return jsonContent(decoded);
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// unix_to_iso
// ---------------------------------------------------------------------------
server.registerTool(
  "unix_to_iso",
  {
    title: "Unix timestamp to ISO 8601",
    description:
      "Convert a Unix timestamp (seconds or milliseconds, auto-detected) to an ISO 8601 UTC string.",
    inputSchema: {
      ts: z
        .number()
        .describe("Unix timestamp. Values >= 1e12 are treated as milliseconds, else seconds."),
    },
  },
  async ({ ts }) => {
    try {
      return jsonContent(unixToIso(ts));
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// iso_to_unix
// ---------------------------------------------------------------------------
server.registerTool(
  "iso_to_unix",
  {
    title: "ISO 8601 to Unix timestamp",
    description:
      "Convert an ISO 8601 (or any Date-parseable) string to a Unix timestamp. Returns both seconds and milliseconds.",
    inputSchema: {
      iso: z.string().describe("Date string, e.g. 2024-01-01T00:00:00Z."),
    },
  },
  async ({ iso }) => {
    try {
      return jsonContent(isoToUnix(iso));
    } catch (err) {
      return errorContent(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr ONLY — stdout carries the JSON-RPC protocol stream.
  console.error("mcp-dev-utils running on stdio");
}

main().catch((err) => {
  console.error("mcp-dev-utils fatal error:", err);
  process.exit(1);
});
