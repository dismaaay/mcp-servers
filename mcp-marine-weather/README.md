# Marine Weather MCP

[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives any
MCP-compatible AI client (Claude Desktop, Claude Code, etc.) live **marine weather**
for any ocean or sea location — wave height, wave direction & period, wind-wave and
swell components, and sea surface temperature.

Data comes from the free [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api).
**No API key required.**

---

## Tool

### `get_marine`

Get the current marine-weather snapshot for a coordinate over water.

| Parameter   | Type   | Range          | Description                          |
| ----------- | ------ | -------------- | ------------------------------------ |
| `latitude`  | number | `-90` … `90`   | Latitude in decimal degrees.         |
| `longitude` | number | `-180` … `180` | Longitude in decimal degrees.        |

Returns a human-readable summary plus a structured JSON snapshot with these metrics
(when available): significant wave height, wave direction, wave period, wind-wave
height/direction/period, swell-wave height/direction/period, and sea surface
temperature.

> Marine data is only available over water. Inland coordinates may return `null`
> values.

#### Example output

```
Marine conditions at 54.5417, 5.9583 (GMT)
Observation time: 2026-06-17T10:30

- Significant wave height: 0.84 m
- Wave direction: 297 °
- Wave period: 4.7 s
- Wind wave height: 0.54 m
- Wind wave direction: 198 °
- Wind wave period: 2.8 s
- Swell wave height: 0.6 m
- Swell wave direction: 349 °
- Swell wave period: 5.15 s
- Sea surface temperature: 14 °C
```

---

## Installation

```bash
git clone <this-repo>
cd mcp-marine-weather
npm install
npm run build
```

## Verify it works (live smoke test)

Performs a real MCP handshake over stdio, lists tools, and makes one real API
call, asserting that real numeric data comes back:

```bash
node smoke-test.mjs
# ... prints the live data and ends with: PASS
```

---

## Claude Desktop configuration

Add the server to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "marine-weather": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-marine-weather/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

> "What are the wave conditions in the North Sea at 54.5, 6.0?"
> "Is the swell big off Nazaré, Portugal right now? (39.6, -9.1)"

---

## Claude Code configuration

```bash
claude mcp add marine-weather -- node /absolute/path/to/mcp-marine-weather/dist/index.js
```

---

## Development

```bash
npm run dev     # run from TypeScript source via tsx
npm run build   # compile to dist/
npm run smoke   # build output must exist; runs the live smoke test
```

Project layout:

```
src/api.ts     Core Open-Meteo client (no MCP imports) — fetch + 10s timeout, validation, errors
src/index.ts   MCP server: registers get_marine over stdio (stderr-only logging)
smoke-test.mjs Live protocol + real-API smoke test
```

---

## How it works

- Uses the Node global `fetch` with a hard **10 second** timeout via `AbortController`.
- Sends a descriptive `User-Agent` header for good API citizenship.
- Validates coordinate ranges before calling the API.
- Maps Open-Meteo error responses (`{ "error": true, "reason": ... }`) and HTTP
  errors to clear tool errors.
- All logs go to **stderr** so they never corrupt the JSON-RPC stream on stdout.

## Data source & license

- Weather data: [Open-Meteo](https://open-meteo.com/) — free for non-commercial and
  commercial use under their terms (CC BY 4.0 for the data).
- This server: [MIT](./LICENSE).
