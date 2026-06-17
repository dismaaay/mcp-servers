# mcp-quotes

A small, polished [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that gives any MCP-capable client (Claude Desktop, Claude Code, etc.) the
ability to fetch inspirational quotes from a live, **key-free** quotes API.

No API key. No account. Just add it to your client and ask for a quote.

## Tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `random_quote` | `tags?: string[]` | Returns a random quote. If `tags` is supplied, the pick is biased toward quotes whose text or author mentions any of those topic keywords (e.g. `["love"]`, `["success", "wisdom"]`). |
| `search_quotes` | `query: string` | Full-text search across quote text **and** author name (case-insensitive). Returns up to 10 matches. |
| `quotes_by_author` | `author: string` | Returns quotes by an author. The name is matched case-insensitively as a substring, so `einstein` matches `Albert Einstein`. Returns up to 20. |

### Example output

```
Found 10 quote(s) for "success":

1. "Success Is Dependent Upon The Glands - Sweat Glands."
   - Zig Ziglar

2. "Applause Waits On Success."
   - Aeschylus
```

## Data source

This server wraps the **[DummyJSON Quotes API](https://dummyjson.com/docs/quotes)**
(`https://dummyjson.com/quotes`), a stable, free, no-key endpoint with ~1,450
quotes.

> **Note on the original target.** This server was originally specced against
> `api.quotable.io`. That service has been shut down and its domain now fails
> DNSSEC validation (`SERVFAIL` — "No DNSKEY matches DS RRs of quotable.io"), so
> it is unreachable from any validating resolver. DummyJSON was selected as a
> reliable, key-free, drop-in replacement that supports all three tools with
> real live data.

`random_quote` calls the upstream `/quotes/random` endpoint directly. Because the
upstream catalog is small and static, `search_quotes` and `quotes_by_author`
fetch the full catalog once (cached in memory for the process lifetime) and
filter it locally — this keeps results fast and deterministic. The upstream
dataset has no structured tag field, so `random_quote`'s `tags` argument is
honoured as a free-text topic filter against the quote text and author.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

A live end-to-end test spawns the server, performs the MCP handshake over stdio,
lists the tools, and makes a real tool call against the live API:

```bash
npm test        # build + smoke test
# or, after building:
node smoke-test.mjs
```

It prints `PASS` on success.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "quotes": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-quotes/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then try: *"Give me a random quote about success"* or
*"Find quotes by Rumi."*

## Use with Claude Code

```bash
claude mcp add quotes -- node /Users/samsung/mcp-catalog/mcp-quotes/dist/index.js
```

## Project layout

```
src/api.ts        Core fetch + filter logic. No MCP imports — independently testable.
src/index.ts      MCP server: registers the three tools over the stdio transport.
smoke-test.mjs    Live protocol handshake + real tool call.
```

All logs go to **stderr**; **stdout** is reserved for the MCP protocol.

## License

MIT
