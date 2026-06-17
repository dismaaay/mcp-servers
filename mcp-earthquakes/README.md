# mcp-earthquakes

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives
any MCP-compatible client (Claude Desktop, Claude Code, etc.) real-time access
to global earthquake data from the **USGS FDSN event web service**.

No API key. No account. The USGS feed is public and free.

---

## What it does

It wraps the USGS endpoint
`https://earthquake.usgs.gov/fdsnws/event/1/query` (GeoJSON) and exposes two
tools that return clean, readable summaries — magnitude, location, depth,
time (UTC), tsunami flag, felt reports, and a link to the USGS event page.

## Tools

### `recent`
Most recent earthquakes worldwide, newest first.

| Param          | Type   | Required | Description                                          |
| -------------- | ------ | -------- | ---------------------------------------------------- |
| `minMagnitude` | number | no       | Only return quakes at or above this magnitude.       |
| `limit`        | int    | no       | Max events to return (default 10, max 500).          |

Example prompt: *"Show me recent earthquakes above magnitude 5."*

### `by_region`
Earthquakes within a circular region around a center point.

| Param          | Type   | Required | Description                                  |
| -------------- | ------ | -------- | -------------------------------------------- |
| `lat`          | number | yes      | Center latitude (-90 to 90).                 |
| `lon`          | number | yes      | Center longitude (-180 to 180).              |
| `radiuskm`     | number | yes      | Search radius in kilometers.                 |
| `minMagnitude` | number | no       | Only return quakes at or above this value.   |
| `limit`        | int    | no       | Max events to return (default 20, max 500).  |

Example prompt: *"Any earthquakes within 300 km of Los Angeles in the recent feed?"*

### Sample output

```
Recent earthquakes (M2.5+) — 5 event(s), newest first

- M4.7 (mb)  31 km SW of Balangonan, Philippines
    2026-06-17 08:03:29 UTC | 80 km deep | 5.362, 125.166
    https://earthquake.usgs.gov/earthquakes/eventpage/us7000stl0
```

---

## Install & build

```bash
npm install
npm run build      # compiles src/ -> dist/ with tsc
```

## Verify it works (live)

```bash
npm run smoke      # connects over stdio, lists tools, makes one real USGS call, prints PASS
```

## Run

```bash
npm start          # node dist/index.js  (stdio server)
# or during development:
npm run dev        # tsx src/index.ts
```

The server speaks MCP over **stdio**: stdout carries the protocol, and all
logging goes to **stderr**.

---

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "earthquakes": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-earthquakes/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should then be able to ask, for example,
*"What are the latest magnitude 4+ earthquakes?"* and Claude will call the
`recent` tool.

---

## Project layout

```
src/api.ts        Pure USGS fetch + parsing logic (no MCP imports — unit-testable)
src/index.ts      MCP server: tool registration + stdio transport
smoke-test.mjs    Live end-to-end protocol + API test
```

## Notes & limitations

- All times are reported in **UTC**.
- Requests use a hard **10-second timeout**.
- `radiuskm` greater than ~20,000 km effectively covers the whole globe.
- This server only **reads** public data; it makes no writes anywhere.

## License

MIT — see [LICENSE](./LICENSE).

Earthquake data courtesy of the
[U.S. Geological Survey](https://earthquake.usgs.gov/fdsnws/event/1/).
