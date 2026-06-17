#!/usr/bin/env node
/**
 * GitHub Search MCP server.
 *
 * Exposes three tools over the Model Context Protocol (stdio transport):
 *   - search_repos(query, sort?)
 *   - search_code(query)
 *   - search_users(query)
 *
 * All real logic lives in ./api.ts. This file is only the MCP glue.
 * Per the MCP stdio contract, nothing is written to stdout except protocol
 * frames; all diagnostics go to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchRepos,
  searchCode,
  searchUsers,
  GitHubApiError,
  type RepoSort,
} from "./api.js";

const server = new McpServer({
  name: "mcp-github-search",
  version: "1.0.0",
});

/** Wraps a tool body so GitHubApiError becomes a clean MCP error result. */
function toError(err: unknown) {
  const message =
    err instanceof GitHubApiError
      ? err.message
      : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "search_repos",
  {
    title: "Search GitHub Repositories",
    description:
      "Search public GitHub repositories. Supports GitHub search qualifiers " +
      "(e.g. 'language:typescript stars:>1000'). Optionally sort by stars, " +
      "forks, help-wanted-issues, or updated. Returns up to 10 results.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search query, e.g. 'mcp server language:typescript'"),
      sort: z
        .enum(["stars", "forks", "help-wanted-issues", "updated", "best-match"])
        .optional()
        .describe("Sort order (defaults to best-match)"),
    },
  },
  async ({ query, sort }) => {
    try {
      const res = await searchRepos(query, sort as RepoSort | undefined);
      if (res.items.length === 0) {
        return {
          content: [
            { type: "text", text: `No repositories found for "${query}".` },
          ],
        };
      }
      const lines = res.items.map(
        (r, i) =>
          `${i + 1}. ${r.full_name} (★${r.stars}, ⑂${r.forks}${
            r.language ? `, ${r.language}` : ""
          })\n   ${r.description ?? "No description"}\n   ${r.html_url}`
      );
      const text =
        `Found ${res.total_count.toLocaleString()} repositories for "${query}". ` +
        `Top ${res.items.length}:\n\n${lines.join("\n\n")}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return toError(err);
    }
  }
);

server.registerTool(
  "search_code",
  {
    title: "Search GitHub Code",
    description:
      "Search code across public GitHub repositories. Supports qualifiers " +
      "like 'repo:owner/name', 'language:python', 'filename:Dockerfile'. " +
      "Returns up to 10 matching files.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Code search query, e.g. 'addEventListener language:js'"),
    },
  },
  async ({ query }) => {
    try {
      const res = await searchCode(query);
      if (res.items.length === 0) {
        return {
          content: [{ type: "text", text: `No code matches for "${query}".` }],
        };
      }
      const lines = res.items.map(
        (c, i) => `${i + 1}. ${c.repository} — ${c.path}\n   ${c.html_url}`
      );
      const text =
        `Found ${res.total_count.toLocaleString()} code matches for "${query}". ` +
        `Top ${res.items.length}:\n\n${lines.join("\n\n")}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return toError(err);
    }
  }
);

server.registerTool(
  "search_users",
  {
    title: "Search GitHub Users",
    description:
      "Search GitHub users and organizations. Supports qualifiers like " +
      "'type:org', 'location:berlin', 'followers:>1000'. Returns up to 10 results.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("User search query, e.g. 'torvalds' or 'type:org location:sf'"),
    },
  },
  async ({ query }) => {
    try {
      const res = await searchUsers(query);
      if (res.items.length === 0) {
        return {
          content: [{ type: "text", text: `No users found for "${query}".` }],
        };
      }
      const lines = res.items.map(
        (u, i) => `${i + 1}. ${u.login} (${u.type})\n   ${u.html_url}`
      );
      const text =
        `Found ${res.total_count.toLocaleString()} users for "${query}". ` +
        `Top ${res.items.length}:\n\n${lines.join("\n\n")}`;
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return toError(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-github-search running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-github-search:", err);
  process.exit(1);
});
