# mcp-public-apis

An [MCP](https://modelcontextprotocol.io) server that puts the **Public APIs Directory** — a community-curated list of **1500+ free, mostly key-less public APIs** — at your assistant's fingertips. Search by keyword, filter by category, and browse all categories. **No API key required.**

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_apis` | `query` (string, required), `category` (string, optional), `limit` (number, optional, default 25, max 100) | Search the directory by keyword against each API's name and description. Optionally restrict to one category. |
| `list_categories` | _(none)_ | List every category, sorted alphabetically, with the number of APIs in each. |

### Example output

`search_apis({ query: "weather", limit: 3 })`:

```
Found 32 API(s) matching "weather" — showing 3:

IQAir — Air quality and weather data
  Category: Environment
  Auth: apiKey | HTTPS: yes | CORS: unknown
  Link: https://www.iqair.com/air-pollution-data-api
...
```

`list_categories()`:

```
52 categories covering 1599 APIs:
  - Animals (21)
  - Anime (21)
  - Anti-Malware (16)
  ...
```

## Data source

This server wraps the [public-apis](https://github.com/public-apis/public-apis) directory — the same dataset that powered the legacy `api.publicapis.org` service. Because that host is frequently offline, the server reads from a maintained JSON mirror that preserves the original schema (`API`, `Description`, `Auth`, `HTTPS`, `Cors`, `Link`, `Category`), with a secondary mirror as fallback. The full directory is fetched once and cached for the lifetime of the process. Network requests have a 10-second timeout and produce clear errors.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

A live test spawns the built server, performs a real MCP handshake, lists tools, and makes real tool calls against live data:

```bash
npm run smoke
# → handshake complete, listTools, real search_apis + list_categories calls, prints PASS
```

## Use with Claude Desktop

Add the following to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "public-apis": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-public-apis/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"find a free weather API"* or *"what categories of public APIs are there?"*

## Use with the MCP CLI / other clients

The server speaks MCP over **stdio**. Launch it with:

```bash
node dist/index.js
```

All diagnostic logs go to **stderr**; **stdout** carries only the MCP JSON-RPC protocol.

## Development

```bash
npm run dev    # run from source with tsx (no build step)
npm run build  # compile TypeScript to dist/
npm start      # run the compiled server
```

Core logic lives in [`src/api.ts`](src/api.ts) (no MCP imports — pure, testable functions). The MCP wiring lives in [`src/index.ts`](src/index.ts).

## License

MIT
