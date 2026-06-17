# mcp-historical-weather

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives
LLMs access to **historical daily weather data** for any location on Earth, powered
by the free [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api).

**No API key required.** Data spans from 1940 to roughly 5 days ago.

## Features

- `get_history` tool: daily min/max/mean temperature, precipitation, rain, snowfall,
  and max wind speed for a coordinate over an inclusive date range.
- Returns a clean, structured JSON payload plus a computed summary (averages and totals).
- Robust input validation (lat/lon bounds, date format, range ordering) via [Zod](https://zod.dev).
- 10-second network timeout, descriptive `User-Agent` header, and stderr-only logging
  so the stdio JSON-RPC stream stays clean.
- Core API logic in `src/api.ts` is MCP-free and independently reusable/testable.

## Installation

```bash
npm install
npm run build
```

## Usage

The server speaks MCP over **stdio**. After building, run it directly:

```bash
node dist/index.js
```

### Smoke test (live)

Verifies the protocol handshake, lists tools, and makes one real call against the
live Open-Meteo Archive API:

```bash
npm run smoke
# -> prints real weather data and "PASS"
```

## Tool: `get_history`

| Parameter          | Type                          | Required | Description                                        |
| ------------------ | ----------------------------- | -------- | -------------------------------------------------- |
| `latitude`         | number (-90 to 90)            | yes      | Latitude in decimal degrees.                       |
| `longitude`        | number (-180 to 180)          | yes      | Longitude in decimal degrees.                      |
| `start_date`       | string `YYYY-MM-DD`           | yes      | Inclusive start date.                              |
| `end_date`         | string `YYYY-MM-DD`           | yes      | Inclusive end date.                                |
| `temperature_unit` | `"celsius"` \| `"fahrenheit"` | no       | Temperature unit (default `celsius`).              |

### Example response (Berlin, 2024-01-01 to 2024-01-03)

```json
{
  "resolved_latitude": 52.54833,
  "resolved_longitude": 13.407822,
  "elevation": 38,
  "timezone": "Europe/Berlin",
  "start_date": "2024-01-01",
  "end_date": "2024-01-03",
  "units": { "temperature": "°C", "precipitation": "mm", "windspeed": "km/h" },
  "days": [
    {
      "date": "2024-01-01",
      "temperature_max": 7.3,
      "temperature_min": 3.4,
      "temperature_mean": 5.3,
      "precipitation_sum": 1.8,
      "rain_sum": 1.8,
      "snowfall_sum": 0,
      "windspeed_max": 19.7
    }
  ],
  "summary": {
    "day_count": 3,
    "avg_temperature_max": 8.27,
    "avg_temperature_min": 4.37,
    "total_precipitation": 21.1
  }
}
```

## Claude Desktop configuration

Add this to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "historical-weather": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-historical-weather/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:
*"What was the weather in Paris during the first week of July 2003?"*

## Development

```bash
npm run dev     # run from source with tsx (no build step)
npm run build   # compile TypeScript to dist/
npm run smoke   # live end-to-end protocol + API test
```

## Data source & attribution

Weather data by [Open-Meteo.com](https://open-meteo.com), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The historical archive
is based on reanalysis datasets (ERA5 and friends).

## License

MIT
