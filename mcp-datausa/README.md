# mcp-datausa

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the [Data USA](https://datausa.io) public-data API to LLM agents. Query U.S.
population, demographics, and economic data sourced from the U.S. Census Bureau
— **no API key required**.

Built on the official [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

### `get_population`
Get the latest U.S. population for a geography level (Census Bureau ACS 1-year
estimate). Defaults to the whole nation.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `geo` | enum | `Nation` | One of `Nation`, `State`, `County`, `Place`, `Zip`, `MSA`, `PUMA`, `Congressional District` |

Example result (`geo: "Nation"`):

```
U.S. population (2024):
United States: 340,110,990

Source: Census Bureau.
```

### `query`
Run a custom Data USA query: aggregate a `measure` broken down by a `drilldown`
level. Defaults to the population cube (`acs_yg_total_population_1`).

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `measure` | string | — (required) | Measure to aggregate, e.g. `Population` |
| `drilldown` | string | — (required) | Drilldown level, e.g. `State`, `County`, `Nation` |
| `year` | string | all years | `"2024"`, `"latest"`, or omit for every year |
| `cube` | string | population cube | Target a different Data USA cube |

Example (`measure: "Population", drilldown: "State", year: "latest"`):

```
52 row(s) for "Population" by "State" (year=latest):
{"State ID":"04000US01","State":"Alabama","Year":2024,"Population":5157699}
{"State ID":"04000US02","State":"Alaska","Year":2024,"Population":740133}
...
```

Both tools also return `structuredContent` with machine-readable records.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a full protocol handshake against the built server, lists tools, and makes
one real call to the live Data USA API:

```bash
npm run smoke
# → ... PASS
```

## Use with Claude Desktop

Add the following to your Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "datausa": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-datausa/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"What is the U.S.
population?"* or *"Break down population by state."*

## Use with other MCP clients

The server speaks MCP over stdio. Launch it with:

```bash
node dist/index.js
```

All logs are written to stderr; stdout is reserved for the JSON-RPC protocol.

## Data source

Data is served by [Data USA](https://datausa.io) via its Tesseract OLAP API
(`https://api.datausa.io/tesseract`). Population figures come from the U.S.
Census Bureau American Community Survey (ACS) 1-year estimate, table B01003.

## Architecture

- `src/api.ts` — pure Data USA API client (no MCP imports). Global `fetch`,
  10s timeout, descriptive `User-Agent`, typed errors.
- `src/index.ts` — MCP server: registers tools with Zod input schemas and
  maps API results to MCP content.
- `smoke-test.mjs` — live end-to-end protocol + API check.

## License

MIT
