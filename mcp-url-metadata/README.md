# mcp-url-metadata

[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

A tiny, dependency-light [Model Context Protocol](https://modelcontextprotocol.io)
server that fetches **any URL** and extracts its metadata — `<title>`, meta
description, **OpenGraph** (`og:*`) tags, Twitter card tags, the canonical URL,
and a best-guess preview image and site name.

**No API key. No external service.** Just Node's built-in `fetch` and a small,
purpose-built HTML parser. Perfect for link previews, research, summarizing a
page before reading it, or feeding page context into an LLM.

---

## Tool

### `get_metadata(url)`

Fetches a web page and returns its metadata.

| Argument | Type     | Required | Description                                                            |
| -------- | -------- | -------- | ---------------------------------------------------------------------- |
| `url`    | `string` | yes      | The URL to fetch. If the scheme is omitted, `https://` is assumed.     |

Returns two content blocks:

1. A human-readable summary.
2. A structured JSON object:

```jsonc
{
  "url": "https://github.com/",        // final URL after redirects
  "status": 200,
  "contentType": "text/html; charset=utf-8",
  "title": "GitHub · Change is constant. ...",
  "description": "Join the world's most widely adopted ...",
  "canonical": "https://github.com/",
  "openGraph": {
    "title": "GitHub · ...",
    "site_name": "GitHub",
    "image": "https://images.ctfassets.net/.../GH-Homepage.png",
    "type": "object",
    "url": "https://github.com/",
    "description": "..."
  },
  "twitter": {
    "card": "summary_large_image",
    "site": "@github",
    "title": "...",
    "description": "...",
    "image": "..."
  },
  "image": "https://images.ctfassets.net/.../GH-Homepage.png", // best-guess preview
  "siteName": "GitHub"
}
```

**Safety & robustness**

- 10-second request timeout (via `AbortController`).
- Response body capped at 2 MB so huge pages can't exhaust memory.
- Follows redirects and reports the final URL.
- Clear, human-friendly errors for invalid URLs, unsupported schemes
  (only `http`/`https`), non-HTML content types, timeouts, and HTTP error
  statuses.
- All logging goes to **stderr** only — stdout stays a clean JSON-RPC stream.

---

## Install & build

```bash
npm install
npm run build
```

## Run the smoke test

This spawns the built server, performs a real MCP handshake over stdio, lists
the tools, makes a live `get_metadata` call, and asserts the result:

```bash
node smoke-test.mjs
# → ... PASS
```

## Run the server

```bash
npm start          # node dist/index.js
# or during development:
npm run dev        # tsx src/index.ts
```

The server speaks MCP over **stdio**.

---

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "url-metadata": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-url-metadata/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

> _"Get the metadata for https://modelcontextprotocol.io and tell me its OpenGraph image."_

### Use with Claude Code

```bash
claude mcp add url-metadata -- node /absolute/path/to/mcp-url-metadata/dist/index.js
```

---

## Project layout

```
src/api.ts        Core fetch + HTML metadata parser (no MCP imports — reusable/testable)
src/index.ts      MCP server: registers get_metadata over stdio
smoke-test.mjs    Live MCP client handshake + real tool call + assertions
```

## License

MIT
