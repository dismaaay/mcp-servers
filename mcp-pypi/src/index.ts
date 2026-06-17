#!/usr/bin/env node
/**
 * mcp-pypi — an MCP server exposing the public PyPI JSON API.
 *
 * Tools:
 *   - get_package(name): current metadata for a package
 *   - get_releases(name, limit?): release history, newest first
 *
 * Transport: stdio. All diagnostic logging goes to stderr ONLY, so it never
 * corrupts the JSON-RPC stream on stdout.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getPackage,
  getReleases,
  PackageNotFoundError,
  PyPIApiError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-pypi",
  version: "1.0.0",
});

/** Turn any thrown error into a clean MCP error result. */
function errorResult(err: unknown) {
  let message: string;
  if (err instanceof PackageNotFoundError || err instanceof PyPIApiError) {
    message = err.message;
  } else if (err instanceof Error) {
    message = `Unexpected error: ${err.message}`;
  } else {
    message = `Unexpected error: ${String(err)}`;
  }
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "get_package",
  {
    title: "Get PyPI package metadata",
    description:
      "Look up a Python package on PyPI and return its current metadata: " +
      "latest version, summary, author, license, homepage, required Python " +
      "version, dependencies, project URLs and release count.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('The PyPI package name, e.g. "requests" or "flask".'),
    },
  },
  async ({ name }) => {
    try {
      const pkg = await getPackage(name);
      // author / author_email may each hold "Name <email>" or be null; build a
      // single clean line without doubling up brackets.
      const authorLine =
        pkg.author && pkg.authorEmail
          ? `${pkg.author} <${pkg.authorEmail}>`
          : pkg.author ?? pkg.authorEmail ?? "n/a";
      const lines = [
        `# ${pkg.name} ${pkg.version}`,
        "",
        pkg.summary ?? "(no summary)",
        "",
        `- Author: ${authorLine}`,
        `- License: ${pkg.license ?? "n/a"}`,
        `- Requires Python: ${pkg.requiresPython ?? "any"}`,
        `- Homepage: ${pkg.homepage ?? "n/a"}`,
        `- PyPI page: ${pkg.packageUrl ?? "n/a"}`,
        `- Releases: ${pkg.releaseCount}`,
        `- Known vulnerabilities: ${pkg.vulnerabilityCount}`,
        `- Keywords: ${pkg.keywords ? pkg.keywords : "n/a"}`,
      ];

      if (Object.keys(pkg.projectUrls).length > 0) {
        lines.push("", "## Project URLs");
        for (const [label, url] of Object.entries(pkg.projectUrls)) {
          lines.push(`- ${label}: ${url}`);
        }
      }

      if (pkg.requiresDist.length > 0) {
        lines.push("", "## Dependencies");
        for (const dep of pkg.requiresDist.slice(0, 50)) {
          lines.push(`- ${dep}`);
        }
        if (pkg.requiresDist.length > 50) {
          lines.push(`- ...and ${pkg.requiresDist.length - 50} more`);
        }
      }

      return {
        content: [
          { type: "text" as const, text: lines.join("\n") },
          {
            type: "text" as const,
            text: JSON.stringify(pkg, null, 2),
          },
        ],
      };
    } catch (err) {
      console.error(`[mcp-pypi] get_package("${name}") failed:`, err);
      return errorResult(err);
    }
  }
);

server.registerTool(
  "get_releases",
  {
    title: "Get PyPI release history",
    description:
      "List the release/version history of a Python package on PyPI, " +
      "newest first, including upload date, file count, distribution types " +
      "(sdist/wheel) and whether a release was yanked.",
    inputSchema: {
      name: z
        .string()
        .min(1)
        .describe('The PyPI package name, e.g. "requests".'),
      limit: z
        .number()
        .int()
        .positive()
        .max(200)
        .optional()
        .describe("Maximum number of releases to return (default 25, max 200)."),
    },
  },
  async ({ name, limit }) => {
    try {
      const data = await getReleases(name, limit ?? 25);
      const lines = [
        `# ${data.name} — ${data.total} releases (latest: ${data.latest})`,
        `Showing ${data.releases.length} most recent:`,
        "",
      ];
      for (const r of data.releases) {
        const date = r.uploadTime ? r.uploadTime.slice(0, 10) : "unknown date";
        const types =
          r.packageTypes.length > 0 ? r.packageTypes.join(", ") : "no files";
        const yanked = r.yanked ? " [YANKED]" : "";
        lines.push(`- ${r.version} — ${date} — ${types}${yanked}`);
      }

      return {
        content: [
          { type: "text" as const, text: lines.join("\n") },
          { type: "text" as const, text: JSON.stringify(data, null, 2) },
        ],
      };
    } catch (err) {
      console.error(`[mcp-pypi] get_releases("${name}") failed:`, err);
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never write to stdout, it carries the JSON-RPC stream.
  console.error("[mcp-pypi] server running on stdio");
}

main().catch((err) => {
  console.error("[mcp-pypi] fatal error:", err);
  process.exit(1);
});
