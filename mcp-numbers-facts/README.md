# mcp-numbers-facts

A small, polished [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that gives LLMs interesting **number, math, and date facts** — a wrapper
around the classic [Numbers API](http://numbersapi.com) style of trivia.

It runs over stdio and exposes three tools:

| Tool          | Arguments              | Example output |
| ------------- | ---------------------- | -------------- |
| `number_fact` | `number` (integer)     | `42 is the number of kilometers in a marathon.` |
| `math_fact`   | `number` (integer)     | `6 is the first discrete biprime...` |
| `date_fact`   | `month` (1-12), `day` (1-31) | `February 29th is ...` |

No API key required.

## How it gets real data (resilient by design)

The original `http://numbersapi.com` host is, as of this writing, defunct (the
domain is parked). Rather than break, this server resolves every request through
a three-tier strategy and always returns a **real** fact:

1. **Live** — tries the original `numbersapi.com` host first (in case it is ever
   revived).
2. **Archive** — falls back to the Internet Archive Wayback Machine *identity
   replay* of the original Numbers API responses. This returns the authentic,
   unmodified original Numbers API data, no API key needed.
3. **Local** — a deterministic offline guarantee so every valid input still
   yields a true fact:
   - **Math facts** are computed from genuine mathematical properties
     (primality, prime factorization, perfect squares/cubes, Fibonacci and
     perfect numbers).
   - **Number/date facts** use a small bundled set of authentic facts, otherwise
     a truthful structural statement about the value.

Every response includes a `source` field (`live` | `archive` | `local`) in its
structured content so you always know where the fact came from.

All network calls use a 10s timeout and a descriptive `User-Agent`. Logs go to
**stderr only**; stdout is reserved for the MCP JSON-RPC channel.

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live protocol handshake + real API call)

```bash
node smoke-test.mjs
```

This spawns the built server, performs a real MCP handshake, lists the tools,
calls `number_fact(42)` over the network, asserts a non-empty real fact comes
back, and prints `PASS`. Example:

```
[smoke] tools: date_fact, math_fact, number_fact
[smoke] returned fact (source=archive): "42 is the number of kilometers in a marathon."
REAL DATA RETURNED: 42 is the number of kilometers in a marathon.
PASS
```

## Use with Claude Desktop

Add the server to your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "numbers-facts": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-numbers-facts/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"Give me a fact about the
number 42"*, *"What's a math fact about 1729?"*, or *"Tell me about February
29th."* and Claude will call the corresponding tool.

> Tip: use an absolute path to `dist/index.js`. Run `npm run build` first so the
> compiled file exists.

## Use with other MCP clients

Any MCP client that supports stdio servers can launch:

```bash
node /Users/samsung/mcp-catalog/mcp-numbers-facts/dist/index.js
```

After publishing to npm you could also run it via `npx mcp-numbers-facts`.

## Development

```bash
npm run dev    # run from TypeScript source with tsx
npm run build  # type-check + emit to dist/
npm run smoke  # build output must exist first
```

Core logic lives in [`src/api.ts`](src/api.ts) and has **no MCP imports**, so it
is easy to test or reuse on its own. The protocol layer is in
[`src/index.ts`](src/index.ts).

## License

MIT — see [LICENSE](LICENSE). Number/math/date trivia is sourced from the
original open Numbers API dataset (also MIT) via the Internet Archive.
