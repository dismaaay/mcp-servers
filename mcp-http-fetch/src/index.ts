#!/usr/bin/env node
/**
 * mcp-http-fetch — a Model Context Protocol server that exposes generic HTTP
 * request tools (GET / POST / JSON) over stdio.
 *
 * No API key required. Logs go to stderr only so they never corrupt the JSON-RPC
 * stream on stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { httpGet, httpPost, fetchJson } from "./api.js";

const server = new McpServer({
  name: "mcp-http-fetch",
  version: "1.0.0",
});

const headersSchema = z
  .record(z.string(), z.string())
  .describe("Optional HTTP request headers as a flat key/value object.");

server.registerTool(
  "http_get",
  {
    title: "HTTP GET",
    description:
      "Perform an HTTP GET request to any http(s) URL and return the status code, response headers, and body text. Optionally include custom request headers.",
    inputSchema: {
      url: z.string().url().describe("The absolute http(s) URL to GET."),
      headers: headersSchema.optional(),
    },
  },
  async ({ url, headers }) => {
    const result = await httpGet(url, headers);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  },
);

server.registerTool(
  "http_post",
  {
    title: "HTTP POST",
    description:
      "Perform an HTTP POST request to any http(s) URL. A string body is sent as-is; any JSON-serializable value is sent as a JSON payload with an application/json Content-Type. Returns status, headers, and body text.",
    inputSchema: {
      url: z.string().url().describe("The absolute http(s) URL to POST to."),
      body: z
        .union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
        .optional()
        .describe(
          "Request body. A string is sent verbatim; an object/array is JSON-encoded.",
        ),
      headers: headersSchema.optional(),
    },
  },
  async ({ url, body, headers }) => {
    const result = await httpPost(url, body, headers);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  },
);

server.registerTool(
  "fetch_json",
  {
    title: "Fetch JSON",
    description:
      "GET a URL and parse the response as JSON, returning the parsed value. Errors if the response is not valid JSON.",
    inputSchema: {
      url: z
        .string()
        .url()
        .describe("The absolute http(s) URL returning a JSON body."),
    },
  },
  async ({ url }) => {
    const result = await fetchJson(url);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-http-fetch running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-http-fetch:", err);
  process.exit(1);
});
