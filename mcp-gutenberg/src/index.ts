#!/usr/bin/env node
/**
 * mcp-gutenberg — a Model Context Protocol server exposing the Project
 * Gutenberg catalog (via the free, key-less Gutendex API) to LLM clients.
 *
 * Tools:
 *   - search_books(query, page?)  Search 70,000+ public-domain ebooks.
 *   - get_book(id)                Full metadata for one book by ID.
 *   - popular_books(limit?)       Most-downloaded books right now.
 *
 * Transport: stdio. All diagnostic logging goes to stderr so it never
 * corrupts the JSON-RPC stream on stdout.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchBooks,
  getBook,
  popularBooks,
  preferredFormatUrl,
  formatBookLine,
  GutendexError,
  type Book,
} from "./api.js";

const server = new McpServer({
  name: "mcp-gutenberg",
  version: "1.0.0",
});

/** Wrap a tool body so any error is returned as an MCP error result. */
function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function fail(err: unknown) {
  const message =
    err instanceof GutendexError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Build a rich, human-readable detail block for a single book. */
function renderBookDetail(book: Book): string {
  const authors =
    book.authors.length > 0
      ? book.authors
          .map(
            (a) =>
              `${a.name}${
                a.birth_year || a.death_year
                  ? ` (${a.birth_year ?? "?"}–${a.death_year ?? "?"})`
                  : ""
              }`
          )
          .join("; ")
      : "Unknown";
  const readUrl = preferredFormatUrl(book);
  const lines = [
    `Title: ${book.title}`,
    `ID: ${book.id}`,
    `Author(s): ${authors}`,
    `Languages: ${book.languages.join(", ") || "n/a"}`,
    `Downloads: ${book.download_count.toLocaleString()}`,
    `Copyright: ${book.copyright === null ? "unknown" : book.copyright ? "yes" : "no (public domain)"}`,
    book.subjects.length
      ? `Subjects: ${book.subjects.slice(0, 6).join("; ")}${book.subjects.length > 6 ? " …" : ""}`
      : null,
    book.bookshelves.length ? `Bookshelves: ${book.bookshelves.join("; ")}` : null,
    readUrl ? `Read/Download: ${readUrl}` : null,
    book.summaries?.length ? `\nSummary: ${book.summaries[0]}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

server.registerTool(
  "search_books",
  {
    title: "Search Project Gutenberg",
    description:
      "Search Project Gutenberg's 70,000+ free public-domain ebooks by author name and/or title keywords. Returns matching books ranked by relevance with IDs, authors, languages and download counts.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search keywords matched against author names and book titles, e.g. 'jane austen' or 'moby dick'."),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional 1-based page number (32 results per page)."),
    },
  },
  async ({ query, page }) => {
    try {
      const data = await searchBooks(query, page ?? 1);
      if (data.results.length === 0) {
        return ok(`No books found for "${query}".`);
      }
      const header = `Found ${data.count.toLocaleString()} book(s) for "${query}" (showing ${data.results.length}${
        data.next ? ", more pages available" : ""
      }):\n`;
      const body = data.results.map((b) => formatBookLine(b)).join("\n");
      return ok(`${header}\n${body}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "get_book",
  {
    title: "Get Book Details",
    description:
      "Fetch full metadata for a single Project Gutenberg book by its numeric ID, including authors, subjects, languages, copyright status, a summary (when available), and a link to read or download it.",
    inputSchema: {
      id: z
        .number()
        .int()
        .positive()
        .describe("Project Gutenberg book ID, e.g. 1342 for 'Pride and Prejudice'."),
    },
  },
  async ({ id }) => {
    try {
      const book = await getBook(id);
      return ok(renderBookDetail(book));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "popular_books",
  {
    title: "Popular Books",
    description:
      "List the most-downloaded books on Project Gutenberg right now (the canonical popularity ranking). Optionally limit how many are returned.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(32)
        .optional()
        .describe("How many books to return (1-32). Defaults to 10."),
    },
  },
  async ({ limit }) => {
    try {
      const books = await popularBooks(limit ?? 10);
      const body = books
        .map((b, i) => `${i + 1}. ${formatBookLine(b)}`)
        .join("\n");
      return ok(`Most-downloaded Project Gutenberg books:\n\n${body}`);
    } catch (err) {
      return fail(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-gutenberg running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting mcp-gutenberg:", err);
  process.exit(1);
});
