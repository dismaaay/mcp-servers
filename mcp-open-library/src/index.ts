#!/usr/bin/env node
/**
 * Open Library MCP server.
 *
 * Exposes three tools over stdio:
 *   - search_books(query, limit)
 *   - get_book(isbn)
 *   - author_works(author, limit)
 *
 * IMPORTANT: stdout carries the MCP protocol. All human-readable logging MUST
 * go to stderr (console.error) so it never corrupts the JSON-RPC stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchBooks,
  getBook,
  authorWorks,
  OpenLibraryError,
} from "./api.js";

const server = new McpServer({
  name: "mcp-open-library",
  version: "1.0.0",
});

/** Wrap a tool handler so API errors become clean MCP error results. */
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function fail(err: unknown) {
  const msg =
    err instanceof OpenLibraryError
      ? err.message
      : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

/* ------------------------------ search_books ----------------------------- */

server.registerTool(
  "search_books",
  {
    title: "Search books",
    description:
      "Search the Open Library catalog by title, author, keyword, or free text. " +
      "Returns matching books with author(s), first publish year, and edition count.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Free-text search, e.g. 'the hobbit' or 'tolkien fantasy'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max number of results to return (1-50, default 10)."),
    },
  },
  async ({ query, limit }) => {
    try {
      const { totalFound, results } = await searchBooks(query, limit ?? 10);
      if (results.length === 0) {
        return ok(`No books found for "${query}".`);
      }
      const lines = results.map((r, i) => {
        const authors = r.authors.length ? r.authors.join(", ") : "Unknown author";
        const year = r.firstPublishYear ? ` (${r.firstPublishYear})` : "";
        const editions =
          r.editionCount != null ? ` — ${r.editionCount} edition(s)` : "";
        const key = r.workKey ? ` [${r.workKey}]` : "";
        return `${i + 1}. ${r.title}${year} by ${authors}${editions}${key}`;
      });
      return ok(
        `Found ${totalFound.toLocaleString()} result(s) for "${query}" ` +
          `(showing ${results.length}):\n\n${lines.join("\n")}`,
      );
    } catch (err) {
      return fail(err);
    }
  },
);

/* -------------------------------- get_book ------------------------------- */

server.registerTool(
  "get_book",
  {
    title: "Get book by ISBN",
    description:
      "Look up a single book/edition by its ISBN-10 or ISBN-13. Returns title, " +
      "authors, publisher(s), publish date, page count, and subjects.",
    inputSchema: {
      isbn: z
        .string()
        .min(10)
        .describe("ISBN-10 or ISBN-13 (hyphens/spaces allowed)."),
    },
  },
  async ({ isbn }) => {
    try {
      const b = await getBook(isbn);
      const parts: string[] = [];
      parts.push(`Title: ${b.title}${b.subtitle ? `: ${b.subtitle}` : ""}`);
      parts.push(`ISBN: ${b.isbn}`);
      parts.push(
        `Author(s): ${b.authors.length ? b.authors.join(", ") : "Unknown"}`,
      );
      if (b.publishers.length)
        parts.push(`Publisher(s): ${b.publishers.join(", ")}`);
      if (b.publishDate) parts.push(`Published: ${b.publishDate}`);
      if (b.numberOfPages) parts.push(`Pages: ${b.numberOfPages}`);
      else if (b.pagination) parts.push(`Pagination: ${b.pagination}`);
      if (b.subjects.length)
        parts.push(`Subjects: ${b.subjects.slice(0, 10).join(", ")}`);
      if (b.openLibraryUrl) parts.push(`Open Library: ${b.openLibraryUrl}`);
      if (b.coverUrl) parts.push(`Cover: ${b.coverUrl}`);
      return ok(parts.join("\n"));
    } catch (err) {
      return fail(err);
    }
  },
);

/* ----------------------------- author_works ------------------------------ */

server.registerTool(
  "author_works",
  {
    title: "List an author's works",
    description:
      "Find an author by name and list their works (books) from Open Library. " +
      "Resolves the author name to an Open Library author record first.",
    inputSchema: {
      author: z
        .string()
        .min(1)
        .describe("Author name, e.g. 'J.R.R. Tolkien' or 'Ursula K. Le Guin'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max number of works to return (1-50, default 10)."),
    },
  },
  async ({ author, limit }) => {
    try {
      const r = await authorWorks(author, limit ?? 10);
      if (r.works.length === 0) {
        return ok(`No works found for author "${r.authorName}".`);
      }
      const lines = r.works.map((w, i) => {
        const date = w.firstPublishDate ? ` (${w.firstPublishDate})` : "";
        const key = w.workKey ? ` [${w.workKey}]` : "";
        return `${i + 1}. ${w.title}${date}${key}`;
      });
      return ok(
        `${r.authorName} [${r.authorKey}] — ${r.totalWorks.toLocaleString()} ` +
          `work(s) total (showing ${r.works.length}):\n\n${lines.join("\n")}`,
      );
    } catch (err) {
      return fail(err);
    }
  },
);

/* -------------------------------- startup -------------------------------- */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr ONLY — stdout is reserved for the MCP protocol stream.
  console.error("mcp-open-library server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-open-library:", err);
  process.exit(1);
});
