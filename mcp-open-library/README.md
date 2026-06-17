# mcp-open-library

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
LLM clients live access to the [Open Library](https://openlibrary.org) catalog —
search books, look up an edition by ISBN, and list an author's works.

**No API key required.** Open Library is a free, open project of the Internet Archive.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_books` | `query` (string), `limit` (int 1–50, default 10) | Free-text search across the Open Library catalog. Returns title, author(s), first publish year, and edition count. |
| `get_book` | `isbn` (ISBN-10 or ISBN-13, hyphens/spaces allowed) | Look up a single edition by ISBN. Returns title, authors, publisher(s), publish date, page count, and subjects. |
| `author_works` | `author` (string), `limit` (int 1–50, default 10) | Resolve an author by name, then list their works. |

### Example output

```
search_books("the hobbit", 3)
→ Found 412 result(s) for "the hobbit" (showing 3):
  1. The Hobbit (1937) by J.R.R. Tolkien — 462 edition(s) [/works/OL27482W]
  ...

get_book("9780261103344")
→ Title: The Hobbit: or There and Back Again
  ISBN: 9780261103344
  Author(s): J.R.R. Tolkien
  Publisher(s): HarperCollins Publishers
  Published: 2011
  ...
```

## Install & build

```bash
npm install
npm run build      # compiles TypeScript to dist/
```

## Smoke test (live)

Runs the built server over stdio with the official MCP client, lists the tools,
and makes real calls against the live Open Library API:

```bash
npm run smoke      # or: node smoke-test.mjs
# → ... PASS
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-library": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-open-library/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like _"search Open Library for books
about distributed systems"_ or _"look up ISBN 9780261103344"_.

## Use with any MCP client

The server speaks MCP over **stdio**. Launch it with:

```bash
node dist/index.js
```

`stdout` carries the JSON-RPC protocol stream; all logs go to `stderr`.

## Project layout

```
src/api.ts        Pure Open Library API client (no MCP imports — independently testable)
src/index.ts      MCP server: registers the three tools and connects over stdio
smoke-test.mjs    Live end-to-end protocol + API test
```

## Design notes

- `src/api.ts` contains zero MCP imports so the fetch/parsing logic is testable in isolation.
- Every request has a **10-second timeout** (via `AbortController`) and returns clear,
  typed errors (`OpenLibraryError`) that the tool layer renders as readable messages.
- `get_book` uses the Open Library Books API (`jscmd=data`), which returns a clean,
  normalized object and resolves edition/work relations for you.
- `author_works` first resolves the author name to an Open Library author key
  (preferring an exact case-insensitive name match), then fetches that author's works.

## API reference

- Search: `https://openlibrary.org/search.json`
- Books (by ISBN): `https://openlibrary.org/api/books?bibkeys=ISBN:<isbn>&jscmd=data&format=json`
- Author search: `https://openlibrary.org/search/authors.json`
- Author works: `https://openlibrary.org/authors/<key>/works.json`

See the [Open Library developer docs](https://openlibrary.org/developers/api).

## License

MIT
