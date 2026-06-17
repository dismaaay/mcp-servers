# mcp-air-quality

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
any MCP-capable client (Claude Desktop, Claude Code, etc.) **real-time air quality
data** for anywhere on Earth.

It wraps the free, **no-API-key** [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
and returns the European AQI and US AQI (with descriptive health bands) plus the
underlying pollutant concentrations: PM2.5, PM10, carbon monoxide, nitrogen
dioxide, sulphur dioxide and ozone.

## Features

- **Zero config** — no API key, no account. Just install and run.
- **One focused tool**: `get_air_quality(latitude, longitude)`.
- Returns both a **human-readable summary** and a **structured JSON** payload.
- Built on the official `@modelcontextprotocol/sdk` with `zod`-validated inputs.
- Robust error handling: input validation, 10-second request timeout, clear
  network/HTTP/API error messages. All logs go to **stderr** only.

## Tool

### `get_air_quality`

| Parameter   | Type   | Range          | Description                          |
| ----------- | ------ | -------------- | ------------------------------------ |
| `latitude`  | number | `-90` to `90`  | Latitude in decimal degrees.         |
| `longitude` | number | `-180` to `180`| Longitude in decimal degrees.        |

**Example output** (Berlin, `52.52, 13.41`):

```
Air quality for 52.5000, 13.4000 (elevation 38 m)
Observed: 2026-06-17T12:00 (Europe/Berlin)

European AQI: 34 — Fair
US AQI: 23 — Good

Pollutants:
  - PM10: 11 μg/m³
  - PM2.5: 6.2 μg/m³
  - Carbon monoxide (CO): 118 μg/m³
  - Nitrogen dioxide (NO₂): 3.1 μg/m³
  - Sulphur dioxide (SO₂): 1 μg/m³
  - Ozone (O₃): 84 μg/m³
```

A second content block contains the same data as machine-readable JSON
(`location`, `time`, `timezone`, `europeanAqiCategory`, `usAqiCategory`,
`pollutants[]`, and `raw` current readings).

## Installation & build

```bash
git clone <this repo>
cd mcp-air-quality
npm install      # installs deps and builds dist/ via the prepare script
npm run build    # (re-run anytime after editing src/)
```

## Run the smoke test

This performs a real MCP handshake against the built server, lists tools, and
makes one live API call:

```bash
npm run smoke
# or: node smoke-test.mjs
```

You should see real data printed followed by `PASS`.

## Use with Claude Desktop

Add this to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "air-quality": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-air-quality/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask, for example:
*"What's the air quality in Tokyo right now?"* and Claude will call
`get_air_quality` with Tokyo's coordinates.

## Use with Claude Code

```bash
claude mcp add air-quality -- node /absolute/path/to/mcp-air-quality/dist/index.js
```

## Project structure

```
mcp-air-quality/
├── src/
│   ├── api.ts        # Core logic (no MCP imports): fetch + parse + format
│   └── index.ts      # MCP server: registers get_air_quality over stdio
├── smoke-test.mjs    # Live protocol handshake + real tool call
├── package.json
├── tsconfig.json
└── README.md
```

## Data source & attribution

Air quality data is provided by [Open-Meteo](https://open-meteo.com/), licensed
under CC BY 4.0. The Air Quality API itself aggregates the Copernicus Atmosphere
Monitoring Service (CAMS) European and global datasets.

## License

MIT
