# mcp-npm

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants live access to the **npm registry** — inspect packages, search, and read download statistics. No API key required.

Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) and the public npm endpoints:

- `https://registry.npmjs.org` — package metadata & search
- `https://api.npmjs.org/downloads` — download counts

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `get_package` | `name: string` | Metadata for a package: latest version, description, license, homepage, repository, author, maintainers, keywords, dist-tags, version count, last publish date. Supports scoped names like `@types/node`. |
| `search_packages` | `query: string`, `limit?: number (1–25, default 10)` | Full-text registry search. Returns name, version, description, publisher and relevance score for the top matches. |
| `get_downloads` | `name: string`, `period?: "last-day" \| "last-week" \| "last-month" \| "last-year"` (default `last-week`) | Download counts for a package over the chosen window. |

### Example output

`get_package("react")`:

```json
{
  "name": "react",
  "description": "React is a JavaScript library for building user interfaces.",
  "latestVersion": "19.2.7",
  "license": "MIT",
  "homepage": "https://react.dev/",
  "repository": "git+https://github.com/facebook/react.git",
  "keywords": ["react"],
  "distTags": { "latest": "19.2.7" },
  "versionCount": 2000
}
```

`get_downloads("react", "last-week")`:

```json
{
  "package": "react",
  "period": "last-week",
  "downloads": 143595274,
  "start": "2026-06-09",
  "end": "2026-06-15"
}
```

## Install & build

```bash
npm install
npm run build
```

## Verify (live smoke test)

The smoke test starts the built server, performs a real MCP handshake over stdio, lists the tools, and makes live calls to the npm registry:

```bash
node smoke-test.mjs
# • connecting + handshake...
# • listing tools...  -> get_downloads, get_package, search_packages
# • calling get_package("react")...  -> react @ 19.2.7 (MIT)
# • calling get_downloads("react", last-week)...  -> 143,595,274
# PASS
```

## Use with Claude Desktop

Add the server to your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "npm": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-npm/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

- "What's the latest version and license of `zod`?"
- "Search npm for state management libraries."
- "How many times was `express` downloaded last month?"

## Use with any MCP client

The server speaks MCP over stdio. Launch it with:

```bash
node dist/index.js
```

It logs `mcp-npm running on stdio` to **stderr** (stdout is reserved for the protocol).

## Project layout

```
src/api.ts        Core npm registry client (no MCP imports, independently testable)
src/index.ts      MCP server: registers the three tools over stdio
smoke-test.mjs    Live protocol handshake + real tool calls
```

## Design notes

- **`fetch` with a 10s timeout** via `AbortController`; clean, model-safe error messages for timeouts, network failures, 404s, and upstream HTTP errors.
- **Input validation** with `zod` at the MCP boundary plus defensive checks in `api.ts` (empty names, whitespace, invalid periods).
- **Response normalization** — npm's `author`/`repository`/`license`/`maintainers` fields come in several shapes; the client flattens them into consistent strings.
- **Logs to stderr only**, so the stdio JSON-RPC stream stays clean.

## License

MIT
