# mcp-spacex

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
wraps the public **[SpaceX API](https://github.com/r-spacex/SpaceX-API)**
(v4/v5). Ask an MCP-aware client (Claude Desktop, etc.) about SpaceX launches
and rockets and get live data back.

**No API key required.**

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `latest_launch` | _none_ | Most recent past launch (name, date, outcome, rocket, links). |
| `next_launch` | _none_ | Next scheduled (upcoming) launch. |
| `get_rocket` | `name_or_id: string` | Rocket specs by name (`"Falcon 9"`, `"Falcon Heavy"`, `"Starship"`) or SpaceX id. |
| `recent_launches` | `limit?: number` (1–50, default 5) | The N most recent past launches, newest first. |

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake over stdio, lists tools, and makes one live SpaceX
API call:

```bash
npm run smoke
# -> ... PASS
```

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "spacex": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-spacex/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

- "What was the latest SpaceX launch?"
- "When is the next SpaceX launch?"
- "Show me the specs for Falcon Heavy."
- "List the 10 most recent SpaceX launches."

## Development

```bash
npm run dev    # run from TypeScript source with tsx
npm run build  # compile to dist/
npm start      # run the built server
```

## Architecture

- `src/api.ts` — pure SpaceX API client (no MCP imports). Uses Node global
  `fetch` with a 10s timeout and a descriptive `User-Agent`.
- `src/format.ts` — human-readable formatting helpers.
- `src/index.ts` — MCP server: registers tools with zod input schemas and
  wires them to the API client. All logs go to **stderr** so stdout stays a
  clean JSON-RPC channel.
- `smoke-test.mjs` — end-to-end protocol + live-API test.

## Notes on the upstream API

This server talks to the community-run `https://api.spacexdata.com` host. The
client surfaces upstream outages (e.g. Cloudflare `5xx`) as clean MCP error
results rather than crashing.

## License

MIT
