#!/usr/bin/env node
/**
 * mcp-github-public — an MCP server exposing the public GitHub REST API.
 *
 * Transport: stdio. STDOUT carries the MCP protocol; ALL logs go to STDERR.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getUser,
  getRepo,
  listRepos,
  searchRepos,
  formatUser,
  formatRepo,
  formatRepoLine,
  GitHubApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-github-public",
  version: "1.0.0",
});

/** Wrap a tool handler so API errors become clean MCP error results. */
function toErrorResult(err: unknown) {
  const message =
    err instanceof GitHubApiError
      ? err.message
      : `Unexpected error: ${(err as Error).message}`;
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "get_user",
  {
    title: "Get GitHub User",
    description:
      "Fetch a public GitHub user or organization profile by username. Returns name, bio, company, location, repo/follower counts, and profile URL.",
    inputSchema: {
      username: z.string().min(1).describe("GitHub username or org login, e.g. 'torvalds'"),
    },
  },
  async ({ username }) => {
    try {
      const user = await getUser(username);
      return { content: [{ type: "text", text: formatUser(user) }] };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "get_repo",
  {
    title: "Get GitHub Repository",
    description:
      "Fetch details for a single public repository by owner and repo name. Returns description, stars, forks, language, license, topics, and URLs.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner (user or org), e.g. 'facebook'"),
      repo: z.string().min(1).describe("Repository name, e.g. 'react'"),
    },
  },
  async ({ owner, repo }) => {
    try {
      const r = await getRepo(owner, repo);
      return { content: [{ type: "text", text: formatRepo(r) }] };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "list_repos",
  {
    title: "List User Repositories",
    description:
      "List a user's public repositories, sorted by most recently pushed. Useful for discovering what someone is actively working on.",
    inputSchema: {
      username: z.string().min(1).describe("GitHub username or org login"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max repos to return (1-100, default 30)"),
    },
  },
  async ({ username, per_page }) => {
    try {
      const repos = await listRepos(username, per_page ?? 30);
      if (repos.length === 0) {
        return {
          content: [{ type: "text", text: `No public repositories found for ${username}.` }],
        };
      }
      const header = `Public repositories for ${username} (${repos.length} shown, sorted by last push):\n`;
      const body = repos.map(formatRepoLine).join("\n");
      return { content: [{ type: "text", text: header + body }] };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

server.registerTool(
  "search_repos",
  {
    title: "Search GitHub Repositories",
    description:
      "Search public repositories across GitHub, sorted by stars (most popular first). Supports GitHub search qualifiers like 'language:python' or 'stars:>1000'.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search query, e.g. 'mcp server language:typescript'"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results to return (1-50, default 10)"),
    },
  },
  async ({ query, per_page }) => {
    try {
      const result = await searchRepos(query, per_page ?? 10);
      if (result.items.length === 0) {
        return {
          content: [{ type: "text", text: `No repositories matched "${query}".` }],
        };
      }
      const header = `Found ${result.total_count.toLocaleString("en-US")} repositories for "${query}" (top ${result.items.length} by stars):\n`;
      const body = result.items.map(formatRepoLine).join("\n");
      return { content: [{ type: "text", text: header + body }] };
    } catch (err) {
      return toErrorResult(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-github-public running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-github-public:", err);
  process.exit(1);
});
