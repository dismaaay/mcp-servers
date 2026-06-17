# mcp-worldbank

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes the
**[World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392)**
to LLM clients such as Claude Desktop. Query development indicators (GDP, population, CO2,
life expectancy, and ~29,000 more), search the indicator catalog, and list countries —
all with **no API key required**.

## Tools

| Tool | Description | Inputs |
| --- | --- | --- |
| `get_indicator` | Fetch time-series values for an indicator in a country. | `country` (ISO 2/3-letter code or `all`), `indicator` (e.g. `NY.GDP.MKTP.CD`), `years` (optional, `2020` or `2010:2020`) |
| `search_indicators` | Search the indicator catalog by free text (all words must match id or name). | `query` (e.g. `gdp per capita`), `limit` (optional, default 25, max 100) |
| `list_countries` | List all countries and aggregate regions with ISO codes, region, income level, capital. | _none_ |

### Examples

- "What was Brazil's GDP from 2020 to 2022?" → `get_indicator(country="BRA", indicator="NY.GDP.MKTP.CD", years="2020:2022")`
- "Find indicators about CO2 emissions" → `search_indicators(query="CO2 emissions")`
- "List the available countries" → `list_countries()`

Common indicator codes: `NY.GDP.MKTP.CD` (GDP, current US$), `SP.POP.TOTL` (population),
`SP.DYN.LE00.IN` (life expectancy), `EN.ATM.CO2E.PC` (CO2 emissions per capita).
Use `search_indicators` to discover more.

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Runs a real MCP handshake over stdio, lists tools, and makes one live World Bank API call:

```bash
npm run smoke
# or: node smoke-test.mjs
```

Expected output ends with `PASS`, e.g.:

```
GDP (current US$) (NY.GDP.MKTP.CD) — Brazil
  2022: 1951923832083.87
  2021: 1670647464062.96
  2020: 1476107292151.95
PASS
```

## Claude Desktop configuration

Add the following to your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "worldbank": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-worldbank/dist/index.js"]
    }
  }
}
```

Use the absolute path to `dist/index.js` on your machine. Restart Claude Desktop, then ask
something like _"Using the worldbank tools, what was Japan's population in 2021?"_

## Development

```bash
npm run dev    # run from source with tsx (no build step)
npm run build  # compile TypeScript to dist/
npm start      # run the compiled server
```

## Architecture

- `src/api.ts` — pure World Bank API client (no MCP imports). Uses Node global `fetch`
  with a 10s timeout, a descriptive `User-Agent` header, input validation, and typed
  results. Reusable as a standalone library.
- `src/index.ts` — MCP server: registers the three tools with `zod` input schemas,
  maps errors to MCP error results, and serves over stdio. All logs go to **stderr**
  so stdout stays a clean JSON-RPC channel.
- `smoke-test.mjs` — end-to-end live test using the MCP client SDK.

## Notes

- The World Bank API has no free-text search endpoint, so `search_indicators` pages
  through the indicator catalog and filters client-side (case-insensitive, AND across
  whitespace-separated terms).
- The API returns errors as a `{ "message": [...] }` object rather than the usual
  `[metadata, data]` tuple; the client detects and surfaces these as readable errors.

## License

MIT
