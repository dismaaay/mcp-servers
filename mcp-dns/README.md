# mcp-dns

A small, dependency-light **Model Context Protocol (MCP)** server that gives any
MCP client (Claude Desktop, etc.) the ability to perform **DNS lookups** —
forward and reverse — using [Cloudflare DNS-over-HTTPS](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/).

- **No API key.** Uses the public `https://cloudflare-dns.com/dns-query`
  (`application/dns-json`) endpoint.
- **Two tools:** `resolve` and `reverse`.
- Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).
- Node global `fetch`, 10s timeout, clear error messages, logs to **stderr only**.

---

## Tools

### `resolve(name, type)`
Forward DNS lookup for a domain name.

| arg    | type   | required | default | notes |
|--------|--------|----------|---------|-------|
| `name` | string | yes      | —       | Domain to resolve, e.g. `example.com` |
| `type` | enum   | no       | `A`     | One of: `A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, PTR, CAA, DS, DNSKEY` |

Example output for `resolve("cloudflare.com", "A")`:

```
DNS A records for cloudflare.com (status: NOERROR):
A	cloudflare.com.	TTL=300	104.16.132.229
A	cloudflare.com.	TTL=300	104.16.133.229
...
```

### `reverse(ip)`
Reverse DNS (PTR) lookup for an IPv4 or IPv6 address.

| arg  | type   | required | notes |
|------|--------|----------|-------|
| `ip` | string | yes      | IPv4 or IPv6, e.g. `1.1.1.1` or `2606:4700:4700::1111` |

Example output for `reverse("1.1.1.1")`:

```
Reverse DNS for 1.1.1.1 (PTR query: 1.1.1.1.in-addr.arpa):
  one.one.one.one.
```

---

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake against the built server and makes live DNS calls:

```bash
node smoke-test.mjs
```

Expected tail:

```
[smoke] resolve cloudflare.com A -> 104.16.132.229 (status NOERROR)
[smoke] reverse 1.1.1.1 -> one.one.one.one.
  PASS — mcp-dns smoke test
```

---

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dns": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-dns/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"What are the MX records
for gmail.com?"* or *"What hostname does 8.8.8.8 reverse to?"*.

> Tip: after `npm run build`, the `dist/index.js` entrypoint is executable and
> has a `#!/usr/bin/env node` shebang, so you can also wire it up via the
> `mcp-dns` bin if installed globally.

---

## Project layout

```
src/api.ts        Core DoH logic (no MCP imports) — resolve, reverse, ptrName
src/index.ts      MCP server: registers the two tools over stdio
smoke-test.mjs    Live protocol handshake + real tool calls
```

## Development

```bash
npm run dev    # run from source with tsx (no build step)
npm start      # run the built server
```

## License

MIT
