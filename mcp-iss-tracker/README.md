# mcp-iss-tracker

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any
MCP-compatible client (Claude Desktop, Claude Code, etc.) track the
**International Space Station** in real time and see **who is currently in space**.

No API key required. Data comes from two free public APIs:

- [wheretheiss.at](https://wheretheiss.at/w/developer) — live ISS position, altitude, and velocity
- [Open Notify](http://open-notify.org/Open-Notify-API/People-In-Space/) — people currently in space

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `iss_position` | none | Real-time ISS latitude, longitude, altitude (km), orbital velocity (km/h), sunlit/eclipsed visibility, ground footprint, and reading timestamp. |
| `people_in_space` | none | Everyone currently in orbit — name and craft per person, total count, and a breakdown by spacecraft. |

### Example output

`iss_position`:

```
The ISS is at -18.2963, -141.5512 (lat, lon), altitude 426.2 km,
traveling 27557 km/h. It is currently eclipsed. Reading as of
2026-06-17T10:38:21.000Z.
```

`people_in_space`:

```
There are 12 people in space right now (ISS: 9, Tiangong: 3):
- Oleg Kononenko (ISS)
- ...
```

Each tool returns a human-readable summary plus a structured JSON block.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake over stdio against the built server and makes a live
API call:

```bash
npm run smoke
# -> ... PASS
```

## Use with Claude Desktop

Add the server to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iss-tracker": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-iss-tracker/dist/index.js"]
    }
  }
}
```

Replace the path with the absolute path to `dist/index.js` on your machine, then
restart Claude Desktop. You can then ask things like *"Where is the ISS right
now?"* or *"Who is in space today?"*.

## Use with Claude Code

```bash
claude mcp add iss-tracker -- node /absolute/path/to/mcp-iss-tracker/dist/index.js
```

## Development

```bash
npm run dev    # run from TypeScript source via tsx
npm run build  # compile to dist/
npm start      # run the compiled server
```

The core data-fetching logic lives in [`src/api.ts`](src/api.ts) and has **no MCP
dependencies**, so it can be reused or unit-tested independently. The MCP wiring
lives in [`src/index.ts`](src/index.ts). All requests send a descriptive
`User-Agent` header and enforce a 10-second timeout. All logs go to stderr so the
stdio JSON-RPC stream stays clean.

## License

MIT
