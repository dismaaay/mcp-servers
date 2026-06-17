# mcp-nasa

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
gives AI assistants live access to NASA's open data:

- **Astronomy Picture of the Day** (APOD)
- **Near-Earth Objects** (asteroids) via NASA's NeoWs feed

It works **out of the box with no signup** — it uses NASA's public `DEMO_KEY`.
For higher rate limits, drop in your own free key from
[api.nasa.gov](https://api.nasa.gov).

---

## Tools

### `apod(date?)`
Astronomy Picture of the Day. Returns the title, an expert explanation, the
image/video URL(s), media type and copyright.

| Argument | Type | Required | Description |
| -------- | ---- | -------- | ----------- |
| `date`   | string (`YYYY-MM-DD`) | no | A specific day. Omit for today. |

### `near_earth_objects(date?)`
Lists asteroids whose closest approach to Earth falls on a given day. For each
object you get its name, estimated diameter, closest miss distance, relative
velocity, and whether it is flagged **potentially hazardous**. Results are
sorted nearest-first.

| Argument | Type | Required | Description |
| -------- | ---- | -------- | ----------- |
| `date`   | string (`YYYY-MM-DD`) | no | A specific day. Omit for today. |

Each tool returns a human-readable summary plus a structured JSON block.

---

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Runs a real MCP handshake and one real NASA API call:

```bash
npm run smoke
# -> ... PASS
```

---

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nasa": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-nasa/dist/index.js"]
    }
  }
}
```

To use your own NASA API key (recommended for heavier use), add an `env` block:

```json
{
  "mcpServers": {
    "nasa": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-nasa/dist/index.js"],
      "env": {
        "NASA_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop, then ask things like:

> *"What's NASA's astronomy picture of the day?"*
> *"Are any potentially hazardous asteroids passing Earth today?"*

---

## Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `NASA_API_KEY` | `DEMO_KEY` | Your NASA API key. The shared `DEMO_KEY` is heavily rate-limited. |

---

## Development

```bash
npm run dev    # run from TypeScript source via tsx
npm run build  # compile to dist/
```

Core HTTP/data logic lives in `src/api.ts` and has **no MCP imports**, so it can
be reused or tested independently. The MCP wiring is in `src/index.ts`. All
logging goes to **stderr** to keep the stdio JSON-RPC channel clean. Requests
use Node's global `fetch` with a 10-second timeout and a descriptive
`User-Agent`.

## License

MIT
