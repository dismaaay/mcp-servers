# mcp-countries

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
gives any MCP-compatible client (Claude Desktop, Claude Code, etc.) live access
to world country data — capitals, regions, currencies, languages, and land
borders.

Built on the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
No API key required.

## Tools

| Tool | Argument | What it returns |
| --- | --- | --- |
| `get_country` | `name` — country name or ISO 3166 alpha-2/alpha-3 code (e.g. `"Poland"`, `"JP"`, `"BRA"`) | Full profile: official name, codes, capital, region/subregion, area, currencies, languages, internet TLD, coordinates, and border codes. |
| `list_by_region` | `region` — region or subregion (e.g. `"Europe"`, `"Western Africa"`) | Every country in that region, with capital and alpha-3 code. |
| `get_borders` | `name` — country name or ISO code | Land-bordering countries, with each border ISO code resolved to its full name. Reports islands / borderless territories. |

### Example output

```
🇵🇱 Poland (Republic of Poland)
Codes: PL / POL
Capital: Warsaw
Region: Europe — Central Europe
Area: 312,679 km²
Currencies: Polish złoty (PLN zł)
Languages: Polish
Internet TLD: .pl
Coordinates: 52, 20
Borders: BLR, CZE, DEU, LTU, RUS, SVK, UKR
```

## Install & build

Requires Node.js 20+ (uses the global `fetch`).

```bash
npm install
npm run build      # compiles src/ -> dist/ with tsc
```

## Verify it works (live)

```bash
npm run smoke      # or: node smoke-test.mjs
```

This spawns the built server over stdio with the real MCP `Client`, performs the
protocol handshake, lists the tools, and makes live tool calls against the
upstream dataset. It prints `PASS` on success.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "countries": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-countries/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask things like:

- "Use the countries tools to give me a profile of Japan."
- "List every country in Western Africa."
- "Which countries border France?"

## Use with Claude Code

```bash
claude mcp add countries -- node /Users/samsung/mcp-catalog/mcp-countries/dist/index.js
```

## Architecture

- `src/api.ts` — pure data-access layer (fetch, search, region filter, border
  resolution). **No MCP imports**, so it can be unit-tested in isolation. Uses
  an `AbortController` 10s timeout, a 1-hour in-process cache, and a typed
  `CountryApiError` for clean failures.
- `src/index.ts` — MCP wiring: registers the three tools with zod-validated
  inputs and formats results as readable text. **All logging goes to stderr**;
  stdout carries only the MCP protocol stream.
- `smoke-test.mjs` — end-to-end live protocol check.

### Data source

The classic `restcountries.com/v3.1` REST endpoints were deprecated and removed,
and the successor (v5) now requires an API key. To stay **key-free and genuinely
live**, this server reads the same canonical upstream dataset REST Countries was
itself built from — the public
[`mledoze/countries`](https://github.com/mledoze/countries) project — which
exposes the identical v3.1-style shape over a free HTTP `GET`. Fetching the full
dataset once also lets us resolve border ISO codes to country names locally.

## License

MIT
