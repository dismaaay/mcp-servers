# mcp-rss

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that fetches and parses **any RSS or Atom feed** by URL. No API key, no account, no rate limits — it reads public feeds directly.

Built on the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Zero runtime dependencies beyond the SDK and `zod` — the RSS 2.0 / RSS 1.0 (RDF) / Atom parser is built in.

## Tools

| Tool       | Arguments                                  | Description                                                                                   |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `get_feed` | `url` (string, required), `limit` (1–100, default 20) | Fetch and parse a feed. Returns feed title/description plus recent items (title, link, date, author, summary). |
| `latest`   | `url` (string, required)                   | Fetch a feed and return only its single most recent item.                                     |

Both tools return a human-readable text summary **and** a structured JSON payload, so the model can read either form.

## Quick start

```bash
npm install
npm run build
npm run smoke     # live handshake + real feed call, prints PASS
```

`npm run smoke` spawns the server over stdio, performs the MCP handshake, lists the tools, and makes a real `get_feed` call against the Hacker News front-page feed.

## Use with Claude Desktop

Add this to your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rss": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-rss/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

> "Use the rss tool to get the latest 5 items from https://hnrss.org/frontpage"
> "What's the most recent post on https://github.com/modelcontextprotocol/typescript-sdk/releases.atom ?"

## Use with any MCP client

The server speaks MCP over **stdio**. Launch it with:

```bash
node /Users/samsung/mcp-catalog/mcp-rss/dist/index.js
```

All diagnostics are written to **stderr**; stdout carries only the MCP JSON-RPC protocol.

## Example feeds (no key required)

- Hacker News front page — `https://hnrss.org/frontpage`
- GitHub releases (Atom) — `https://github.com/<owner>/<repo>/releases.atom`
- BBC News — `https://feeds.bbci.co.uk/news/rss.xml`
- Reddit (Atom) — `https://www.reddit.com/r/programming/.rss`

## Behavior & limits

- **Timeout:** every fetch aborts after 10 seconds.
- **Protocols:** only `http`/`https` URLs are accepted.
- **Formats:** auto-detects RSS 2.0, RSS 1.0 / RDF, and Atom 1.0. Handles CDATA sections and HTML entities; HTML tags are stripped from summaries.
- **Errors:** invalid URLs, non-feed pages, HTTP errors, timeouts, and empty bodies all return clear, actionable error messages.

## Project layout

```
src/api.ts        Pure feed-fetching + parsing logic (no MCP imports)
src/index.ts      MCP server: registers get_feed and latest over stdio
smoke-test.mjs    Live end-to-end protocol test
```

## License

MIT
