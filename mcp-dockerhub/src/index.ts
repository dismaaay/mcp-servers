#!/usr/bin/env node
/**
 * mcp-dockerhub
 *
 * A Model Context Protocol (MCP) server exposing the Docker Hub public API.
 * Tools:
 *   - get_image(repo):  repository metadata (stars, pulls, description, ...)
 *   - list_tags(repo):  available tags with sizes, dates, architectures
 *
 * Communicates over stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getImage, listTags, DockerHubError } from "./api.js";

const server = new McpServer({
  name: "mcp-dockerhub",
  version: "1.0.0",
});

function errorResult(err: unknown) {
  const message =
    err instanceof DockerHubError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(`[mcp-dockerhub] tool error: ${message}`);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

server.registerTool(
  "get_image",
  {
    title: "Get Docker Hub image",
    description:
      "Fetch metadata for a Docker Hub image repository: description, star count, " +
      "pull count, last-updated time, official/private flags and the hub URL. " +
      "Accepts an official image name like 'nginx' or a namespaced repo like 'bitnami/redis'.",
    inputSchema: {
      repo: z
        .string()
        .min(1)
        .describe("Repository name, e.g. 'nginx' (official) or 'bitnami/redis' (namespaced)."),
    },
  },
  async ({ repo }) => {
    try {
      const image = await getImage(repo);
      return {
        content: [{ type: "text", text: JSON.stringify(image, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_tags",
  {
    title: "List Docker Hub tags",
    description:
      "List tags for a Docker Hub image repository, ordered by most recently updated. " +
      "Each tag includes its compressed size, last-updated time, content digest and " +
      "available architectures. Accepts 'nginx' or 'namespace/name'.",
    inputSchema: {
      repo: z
        .string()
        .min(1)
        .describe("Repository name, e.g. 'nginx' or 'bitnami/redis'."),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of tags to return (1-100, default 25)."),
    },
  },
  async ({ repo, page_size }) => {
    try {
      const result = await listTags(repo, page_size ?? 25);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return errorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp-dockerhub] running on stdio");
}

main().catch((err) => {
  console.error("[mcp-dockerhub] fatal:", err);
  process.exit(1);
});
