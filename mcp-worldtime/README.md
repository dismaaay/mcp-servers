# mcp-worldtime

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
LLMs the current time and the list of IANA timezones for anywhere in the world.

It wraps the free, **no-API-key** [worldtimeapi.org](https://worldtimeapi.org/) service,
and **automatically falls back to [timeapi.io](https://timeapi.io/)** when worldtimeapi.org
is unreachable — so the tools keep working even when the primary service is down.

## Tools

### `get_time(timezone)`
Get the current date and time for an IANA timezone.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `timezone` | string | yes | IANA name, e.g. `Europe/Warsaw`, `America/New_York`, `Asia/Tokyo`, `Etc/UTC` |

Returns the ISO-8601 datetime, UTC offset, day of week, whether DST is active,
the Unix timestamp, and which upstream service answered.

### `list_timezones(area?)`
List supported IANA timezones, optionally filtered to a single area.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `area` | string | no | Area prefix, e.g. `Europe`, `America`, `Asia`, `Africa`. Omit for all timezones. |

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Runs a real MCP handshake over stdio, lists the tools, and makes a real API call:

```bash
npm run build
node smoke-test.mjs
```

Expected output ends with `PASS` and prints real time data for `Europe/Warsaw`.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "worldtime": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-worldtime/dist/index.js"]
    }
  }
}
```

Then restart Claude Desktop. You can ask things like:

> What time is it in Tokyo right now?
> List all the timezones in Europe.

## Use with any MCP client

The server speaks MCP over **stdio**. Launch it with:

```bash
node dist/index.js
```

All diagnostic logs go to **stderr**; stdout is reserved for the MCP protocol.

## Development

```bash
npm run dev     # run from TypeScript source via tsx
npm run build   # compile to dist/
npm start       # run the compiled server
```

### Architecture

- `src/api.ts` — pure HTTP client (no MCP imports), Node global `fetch`, 10s
  timeout, clear errors, worldtimeapi.org → timeapi.io fallback. Independently testable.
- `src/index.ts` — MCP server wiring (`McpServer`, `StdioServerTransport`, zod schemas).
- `smoke-test.mjs` — live end-to-end protocol test.

## License

MIT
