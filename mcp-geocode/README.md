# mcp-geocode

A small, dependency-light [Model Context Protocol](https://modelcontextprotocol.io)
server that gives any MCP-compatible client (Claude Desktop, Claude Code, etc.)
the ability to **geocode** and **reverse-geocode** locations using the free
[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) service.

No API key required.

## What it does

| Tool | Input | Output |
| --- | --- | --- |
| `geocode` | `query` (free-form address / place / landmark), optional `limit` (1–50, default 5) | Ranked list of matching places with coordinates, type, and OSM metadata |
| `reverse` | `lat` (-90..90), `lon` (-180..180) | The nearest known address / place |

Coordinates are returned in decimal degrees (WGS84).

### Example

> "Where is the Eiffel Tower?"

```
Found 1 result(s) for "Eiffel Tower":

1. Tour Eiffel, 5, Avenue Anatole France, ... 75007, France
   Coordinates: 48.8582599, 2.2945006
   Type: man_made/tower
   Importance: 0.6206
   OSM: way/5013364
```

## Install & build

```bash
npm install
npm run build      # tsc -> dist/
```

## Run

```bash
npm start          # node dist/index.js  (speaks MCP over stdio)
# or, without building, during development:
npm run dev        # tsx src/index.ts
```

The server communicates over **stdio**: JSON-RPC on stdout, all logs on stderr.

## Smoke test (live)

```bash
npm run smoke      # node smoke-test.mjs
```

This spins up the built server with the official MCP client, lists the tools,
and makes a real call to the live Nominatim API. It prints `PASS` on success.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "geocode": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-geocode/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"geocode 1600
Pennsylvania Ave NW"* or *"what's at latitude 40.689, longitude -74.044?"*

## Use with Claude Code

```bash
claude mcp add geocode -- node /Users/samsung/mcp-catalog/mcp-geocode/dist/index.js
```

## Project layout

```
src/api.ts        Pure Nominatim client (no MCP imports -> unit-testable)
src/index.ts      MCP server: registers the geocode & reverse tools
smoke-test.mjs    Live end-to-end protocol + API test
```

## Usage policy

This server hits the public Nominatim instance, which has a
[usage policy](https://operations.osmfoundation.org/policies/nominatim/):
max 1 request/second, a descriptive `User-Agent` (set automatically by this
server), and no heavy bulk use. For production / high volume, point
`NOMINATIM_BASE` in `src/api.ts` at your own Nominatim instance.

## License

MIT — data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
