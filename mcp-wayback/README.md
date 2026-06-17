# mcp-wayback

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the
**Internet Archive Wayback Machine**. It lets any MCP-compatible client (Claude
Desktop, Claude Code, etc.) find and list archived snapshots of any URL.

No API key required — it uses the public Wayback
[`available`](https://archive.org/help/wayback_api.php) and
[CDX](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md)
endpoints.

## Tools

### `get_snapshot(url, timestamp?)`
Find the archived copy of a URL closest to a given date. If no `timestamp` is
given, returns the most relevant archived copy.

- `url` (string, required) — e.g. `example.com` or `https://nytimes.com`
- `timestamp` (string, optional) — target date as `yyyyMMddHHmmss`. Any leading
  portion works (`2010`, `20100101`, `20100102003410`).

Returns the original URL, a direct link to the archived copy, the capture time
(both 14-digit and ISO 8601), and the HTTP status recorded at capture.

### `list_snapshots(url, limit)`
List historical captures of a URL from the CDX capture index.

- `url` (string, required)
- `limit` (number, optional, default `10`, range `1`–`1000`) — max captures to
  return.

Returns a list of captures, each with capture time, HTTP status, content type,
and a direct archived link. Consecutive captures on the same day are collapsed
to reduce noise.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a live MCP handshake, lists tools, and makes one real call to the
Internet Archive:

```bash
npm run smoke
# or: node smoke-test.mjs
```

Expected tail of output:

```
Handshake OK: connected to mcp-wayback
Tools advertised: get_snapshot, list_snapshots
...
Archived copy: http://web.archive.org/web/20100102003410/http://example.com/
Captured: 2010-01-02T00:34:10Z (timestamp 20100102003410)
PASS
```

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "wayback": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-wayback/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"What did example.com look
like in 2010?"* or *"List the last 5 archived snapshots of nytimes.com."*

## Claude Code configuration

```bash
claude mcp add wayback -- node /absolute/path/to/mcp-wayback/dist/index.js
```

## Development

```bash
npm run dev    # run from TypeScript source with tsx
npm run build  # compile to dist/
```

Core logic lives in [`src/api.ts`](src/api.ts) and has **no MCP imports**, so it
can be reused or tested independently. The MCP wiring is in
[`src/index.ts`](src/index.ts).

## Notes

- All requests send a descriptive `User-Agent` and use a 10s timeout via the
  Node global `fetch`.
- Logs go to **stderr** only; stdout is reserved for the MCP protocol stream.
- The CDX endpoint occasionally has high latency; `get_snapshot` (the
  `available` endpoint) is the fast, reliable path.

## License

MIT
