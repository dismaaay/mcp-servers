# mcp-gutenberg

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives LLMs access to **[Project Gutenberg](https://www.gutenberg.org/)** — over 70,000 free, public-domain ebooks — through the free, key-less **[Gutendex](https://gutendex.com)** API.

Ask Claude (or any MCP client) to find books by author or title, look up full metadata for a specific title, or list what's trending on Project Gutenberg right now.

## Features

- **No API key required.** Gutendex is a free public API.
- Three focused tools: `search_books`, `get_book`, `popular_books`.
- Strict input validation with [zod](https://zod.dev).
- Robust error handling, a 10s network timeout, and a descriptive `User-Agent`.
- Stdio transport; all logs go to stderr so the JSON-RPC stream stays clean.
- Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_books` | `query` (string, required), `page` (int, optional) | Search 70,000+ ebooks by author and/or title keywords. |
| `get_book` | `id` (int, required) | Full metadata for one book by its Project Gutenberg ID, with a read/download link. |
| `popular_books` | `limit` (int 1–32, optional, default 10) | The most-downloaded books on Project Gutenberg. |

### Example output

`get_book({ id: 1342 })`:

```
Title: Pride and Prejudice
ID: 1342
Author(s): Austen, Jane (1775–1817)
Languages: en
Downloads: 117,126
Copyright: no (public domain)
Subjects: England -- Fiction; Love stories; Sisters -- Fiction; ...
Read/Download: https://www.gutenberg.org/ebooks/1342.html.images
```

## Installation

```bash
git clone https://github.com/mcp-catalog/mcp-gutenberg.git
cd mcp-gutenberg
npm install
npm run build
```

## Usage

### Run the smoke test (live API)

Verifies the protocol handshake, lists tools, and makes one real call to Gutendex:

```bash
npm run smoke
# -> ... PASS
```

### Run directly

```bash
node dist/index.js        # built
npm run dev               # from TypeScript source via tsx
```

The server speaks MCP over stdio and is meant to be launched by an MCP client.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gutenberg": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-gutenberg/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should then be able to ask things like:

> "Search Project Gutenberg for books by Jane Austen."
> "Show me details for Gutenberg book 1342."
> "What are the most popular books on Project Gutenberg right now?"

## Project layout

```
mcp-gutenberg/
├── src/
│   ├── api.ts        # Gutendex client (no MCP imports — reusable/testable)
│   └── index.ts      # MCP server: tool registration + stdio transport
├── smoke-test.mjs    # Live handshake + real API call -> PASS
├── package.json
├── tsconfig.json
└── README.md
```

## Notes

- Data comes from Gutendex, which mirrors the Project Gutenberg catalog. Please be respectful of the free service.
- `popular_books` uses Gutendex's default ordering, which is by descending download count — the canonical popularity ranking.

## License

MIT
