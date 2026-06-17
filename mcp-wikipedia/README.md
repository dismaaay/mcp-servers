# mcp-wikipedia

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any MCP-compatible AI client (Claude Desktop, Claude Code, etc.) live access to **Wikipedia**. Search articles, fetch concise summaries, and pull full article text — all from the public Wikipedia APIs.

- **No API key required.**
- Built on the official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).
- Talks to the live Wikipedia [Action API](https://en.wikipedia.org/w/api.php) and [REST v1 API](https://en.wikipedia.org/api/rest_v1/).
- 10-second request timeout, clear error messages, redirect-aware.
- Verified end-to-end with a live stdio smoke test.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search` | `query` (string), `limit` (int 1–50, default 5) | Full-text search of Wikipedia. Returns ranked titles with a snippet, word count, and URL. Use it to find the exact article title. |
| `get_summary` | `title` (string) | Concise summary (lead paragraph) of an article, plus a one-line description and URL. Follows redirects. |
| `get_page_extract` | `title` (string) | Full plain-text body of an article (lead + all sections, markup stripped). Follows redirects. |

All tools return human-readable text. Errors (page not found, timeouts, network issues) are returned as MCP error results with a clear message instead of crashing.

## Install & build

```bash
npm install
npm run build      # compiles TypeScript to dist/
```

## Verify it works (live smoke test)

```bash
npm test           # builds, then runs smoke-test.mjs against the live API
# or, after a build:
node smoke-test.mjs
```

The smoke test connects to the server over stdio with the official MCP client, lists the tools, and makes real calls (`search`, `get_summary`, `get_page_extract`) against Wikipedia, asserting the responses contain real data. It prints `PASS` on success.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wikipedia": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-wikipedia/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should then be able to ask things like *"Search Wikipedia for Alan Turing and summarize the top result."*

### Claude Code

```bash
claude mcp add wikipedia -- node /Users/samsung/mcp-catalog/mcp-wikipedia/dist/index.js
```

## Configuration (optional)

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WIKIPEDIA_LANG` | `en` | Wiki language edition (e.g. `fr`, `de`, `es`). Applies to all tools. |
| `WIKIPEDIA_USER_AGENT` | `mcp-wikipedia/1.0 (...)` | Custom User-Agent sent to Wikipedia (per [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette)). |

## Project layout

```
src/api.ts        Core fetch logic (no MCP imports — independently testable)
src/index.ts      MCP server: registers the 3 tools, stdio transport
smoke-test.mjs    Live end-to-end test using the official MCP client
dist/             Compiled output (after npm run build)
```

Design note: all logging goes to **stderr** (`console.error`). stdout is reserved exclusively for the MCP protocol stream.

## Development

```bash
npm run dev        # run from TypeScript source via tsx (no build step)
```

## License

MIT
