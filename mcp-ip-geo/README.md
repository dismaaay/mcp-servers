# mcp-ip-geo

A small, production-quality [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that gives any MCP-aware client (Claude Desktop, Claude Code, etc.) the ability to
**geolocate IP addresses**. It wraps the free, no-key [ipapi.co](https://ipapi.co) JSON API.

No API key. No account. Just point your client at it and ask "where is 8.8.8.8?".

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `lookup_ip` | `ip: string` | Geolocate a specific IPv4 or IPv6 address. |
| `my_location` | _(none)_ | Geolocate the public IP this server is calling from. |

Both tools return clean, human-readable text including city, region, country,
coordinates, timezone, currency, languages, and network/ASN details. Example output:

```
IP Address:   1.1.1.1 (IPv4)
Location:     Sydney, New South Wales, Australia
Postal Code:  2000
Coordinates:  -33.859336, 151.203624
Timezone:     Australia/Sydney (UTC +1000)
Currency:     AUD (Dollar)
Languages:    en-AU
Calling Code: +61
Network:      Cloudflare, Inc. / AS13335
CIDR:         1.1.1.0/24
In EU:        no
```

## Install & build

```bash
npm install      # installs deps and builds (via the prepare hook)
npm run build    # or build explicitly with tsc
```

## Smoke test (live)

The repo ships a real, end-to-end smoke test. It launches the built server over stdio,
performs the MCP handshake, lists the tools, and makes **one real call** against the live
ipapi.co API:

```bash
npm run smoke    # or: node smoke-test.mjs
```

A successful run prints diagnostics to stderr and `PASS` to stdout.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ip-geo": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-ip-geo/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then try: *"Use the ip-geo tools to tell me where 8.8.8.8 is."*

## Use with Claude Code

```bash
claude mcp add ip-geo -- node /Users/samsung/mcp-catalog/mcp-ip-geo/dist/index.js
```

## Project layout

```
src/api.ts        Core fetch + formatting logic. No MCP imports — independently testable.
src/index.ts      MCP server: registers lookup_ip and my_location over stdio.
smoke-test.mjs    Live end-to-end protocol + API test.
```

## Design notes

- **stdout is the protocol.** All logging goes to **stderr** so it never corrupts the
  JSON-RPC stream.
- **10-second timeout** on every upstream request via `AbortController`.
- **Input validation** with zod at the tool boundary and an IPv4/IPv6 check in `api.ts`.
- **Graceful errors.** ipapi.co reports rate limits and reserved-IP problems in the JSON
  body (`{"error": true, ...}`); these are surfaced as clean tool errors, not crashes.
- **Node 20+** required (uses the global `fetch`).

## Notes on the upstream API

ipapi.co's free tier is rate-limited (roughly ~1k lookups/day, throttled per minute).
If you see a `RateLimited` error, wait a moment and retry, or upgrade your ipapi.co plan.

## License

MIT
