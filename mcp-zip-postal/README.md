# mcp-zip-postal

A small, focused [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server for **worldwide postal / ZIP code lookups**, backed by the free
[Zippopotam.us](https://zippopotam.us) API.

- **No API key required.**
- Built on the official MCP TypeScript SDK.
- Ships with a live smoke test that performs a real protocol handshake and a
  real API call.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `lookup_postal` | `country` (string), `code` (string) | Full record: country, post code, and every associated place with state and latitude/longitude. |
| `places_for_postal` | `country` (string), `code` (string) | Just the list of locality/place names for the given postal code. |

`country` is an ISO-style country code such as `us`, `de`, `gb`, `fr`, `ca`.
`code` is the postal/ZIP code, e.g. `90210` (US) or `01067` (DE).

### Example: `lookup_postal("us", "90210")`

```json
{
  "country": "United States",
  "countryAbbreviation": "US",
  "postCode": "90210",
  "places": [
    {
      "placeName": "Beverly Hills",
      "state": "California",
      "stateAbbreviation": "CA",
      "latitude": 34.0901,
      "longitude": -118.4065
    }
  ]
}
```

### Example: `places_for_postal("de", "01067")`

```json
{
  "postCode": "01067",
  "country": "Germany",
  "placeNames": ["Dresden", "Dresden Friedrichstadt", "Dresden Innere Altstadt"]
}
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Performs a real MCP handshake over stdio, lists the tools, and makes one real
call against the live Zippopotam.us API:

```bash
npm run build
node smoke-test.mjs
```

Expected tail of output:

```
PASS — lookup_postal(us, 90210) => United States, Beverly Hills (CA) @ 34.0901,-118.4065
```

## Use with Claude Desktop

Add the server to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "zip-postal": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-zip-postal/dist/index.js"]
    }
  }
}
```

Use an absolute path to `dist/index.js`. Run `npm run build` first so the
compiled server exists, then restart Claude Desktop. You can then ask things
like *"What city is ZIP code 90210?"* or *"Look up postal code 01067 in
Germany."*

## How it works

- `src/api.ts` — pure API client (no MCP imports). Uses the Node global
  `fetch` with a 10-second timeout via `AbortController`, sends a descriptive
  `User-Agent` header, and normalizes the Zippopotam.us response shape
  (including `latitude`/`longitude` as numbers). Throws `PostalApiError` on
  bad input, network errors, timeouts, and 404 / unknown codes.
- `src/index.ts` — registers the two tools with `zod` input schemas, connects
  over `StdioServerTransport`, and logs only to **stderr** so stdout stays a
  clean JSON-RPC stream.

## License

MIT
