# mcp-http-fetch

A small, dependency-light [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server that lets an LLM make **generic HTTP requests to any URL** — no API
key required. Built on the official MCP TypeScript SDK and Node's global `fetch`.

It gives your assistant three building-block tools for talking to the open web
and any REST API:

| Tool         | Description |
|--------------|-------------|
| `http_get`   | GET a URL; returns status, headers, and body text. Optional custom headers. |
| `http_post`  | POST to a URL; string bodies sent verbatim, objects/arrays sent as JSON. Optional custom headers. |
| `fetch_json` | GET a URL and return the parsed JSON value. |

## Features

- **No credentials.** Works against any public `http(s)` endpoint out of the box.
- **Safe by default.** Only `http`/`https` are allowed (no `file://`, `ftp://`, etc.).
- **10-second timeout** on every request via `AbortController`.
- **Descriptive `User-Agent`** is sent automatically and can be overridden per call.
- **Large-body protection.** Response bodies are truncated at 100k characters with a `truncated` flag.
- **stderr-only logging** so the JSON-RPC stream on stdout is never corrupted.
- Core HTTP logic lives in `src/api.ts` with **zero MCP imports**, so it is easy to unit test or reuse.

## Install & build

```bash
npm install
npm run build
```

## Verify it works (live smoke test)

The repo ships with a real end-to-end smoke test. It launches the built server,
performs the MCP handshake, lists the tools, and makes one **real** call against
the public GitHub API:

```bash
npm run build
node smoke-test.mjs
```

Expected output (abridged):

```
[smoke] connected + handshake OK
[smoke] tools: fetch_json, http_get, http_post
[smoke] real data: full_name=modelcontextprotocol/typescript-sdk stars=12677 language=TypeScript
PASS
```

## Usage with Claude Desktop

Add the server to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "http-fetch": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-http-fetch/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The `http_get`, `http_post`, and `fetch_json` tools will
appear under the tools (hammer) menu.

> Tip: use an **absolute path** to `dist/index.js`. Run `npm run build` first so
> the `dist/` folder exists.

## Usage with any MCP client

The server speaks MCP over **stdio**. Launch it with:

```bash
node dist/index.js
```

Any MCP-compatible client (Claude Desktop, Claude Code, custom `Client` +
`StdioClientTransport`, etc.) can connect and call the tools.

## Tool reference

### `http_get`

```jsonc
{
  "url": "https://api.github.com/repos/modelcontextprotocol/typescript-sdk",
  "headers": { "Accept": "application/vnd.github+json" } // optional
}
```

Returns `{ status, statusText, url, ok, headers, body, truncated }`.

### `http_post`

```jsonc
{
  "url": "https://httpbin.org/post",
  "body": { "hello": "world" },        // object -> JSON; string -> sent as-is
  "headers": { "X-Demo": "1" }         // optional
}
```

Returns `{ status, statusText, url, ok, headers, body, truncated }`.

### `fetch_json`

```jsonc
{ "url": "https://api.github.com/repos/modelcontextprotocol/typescript-sdk" }
```

Returns `{ status, statusText, url, ok, json }` where `json` is the parsed body.
Errors if the response is not valid JSON.

## Project layout

```
src/
  api.ts      Pure HTTP logic (no MCP imports) — testable core
  index.ts    MCP server: registers tools, connects over stdio
smoke-test.mjs  Live handshake + real API call -> prints PASS
```

## License

MIT — see [LICENSE](./LICENSE).
