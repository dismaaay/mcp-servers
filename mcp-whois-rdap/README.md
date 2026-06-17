# mcp-whois-rdap

A small, focused [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that looks up domain registration data (WHOIS / RDAP) using the global [rdap.org](https://rdap.org) bootstrap service.

**No API key required.** rdap.org redirects each query to the authoritative RDAP server for the domain's TLD (Verisign for `.com`, Nominet for `.uk`, etc.) and returns structured registration data.

## Tools

### `lookup_domain`

Look up registration data for a single domain name.

| Input | Type | Description |
| ----- | ---- | ----------- |
| `domain` | string | Domain to look up, e.g. `example.com` or `google.co.uk`. URLs are accepted and reduced to their host. |

Returns a human-readable summary plus structured content with:

- `domain`, `handle`
- `registrar` and `registrarIanaId`
- `status` (EPP status codes)
- `nameservers`
- `secureDns` (DNSSEC delegation signed)
- `abuseEmail`
- `events` (registration, expiration, last changed, ...)
- `rdapServer` (the authoritative server that answered)

**Example output for `example.com`:**

```
Domain: example.com
Handle: 2336799_DOMAIN_COM-VRSN
Registrar: RESERVED-Internet Assigned Numbers Authority (IANA 376)
Status: client delete prohibited, client transfer prohibited, client update prohibited
DNSSEC signed: yes
Events:
  - registration: 1995-08-14T04:00:00Z
  - expiration: 2026-08-13T04:00:00Z
  - last changed: 2026-01-16T18:26:50Z
Nameservers: elliott.ns.cloudflare.com, hera.ns.cloudflare.com
RDAP source: https://rdap.verisign.com/com/v1/domain/example.com
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs the full MCP handshake over stdio, lists tools, and makes one real RDAP call:

```bash
npm run smoke
# or: node smoke-test.mjs
```

Expected output ends with `PASS`.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whois-rdap": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-whois-rdap/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"Who is the registrar for stripe.com and when does it expire?"*

## Use with any MCP client

The server speaks MCP over stdio. Launch it with:

```bash
node dist/index.js
```

All diagnostic logging goes to **stderr**; **stdout** carries only the JSON-RPC protocol stream.

## Project layout

```
src/api.ts        Core RDAP logic (no MCP imports) — fetch, 10s timeout, typed errors
src/index.ts      MCP server: registers lookup_domain, wires stdio transport
smoke-test.mjs    Live protocol test (handshake + listTools + one real callTool)
```

## Notes

- Uses Node's global `fetch` (Node 18+; tested on Node 22/24).
- Each request times out after 10 seconds.
- Errors are typed (`INVALID_INPUT`, `NOT_FOUND`, `TIMEOUT`, `NETWORK`, `HTTP_ERROR`, `PARSE_ERROR`) and surfaced as MCP tool errors with clear messages.
- Some ccTLDs do not run an RDAP service; those return a `NOT_FOUND`-style error from rdap.org.

## License

MIT
