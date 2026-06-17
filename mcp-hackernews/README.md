# mcp-hackernews

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives LLMs live access to [Hacker News](https://news.ycombinator.com). It wraps the public, key-free Hacker News [Firebase API](https://github.com/HackerNews/API) and the [Algolia HN Search API](https://hn.algolia.com/api) — no account or API key required.

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `get_top_stories` | `limit` (1-100, default 10) | Current front-page top stories in ranking order, with scores, authors, comment counts, and links. |
| `get_story` | `id` (positive integer) | A single Hacker News item (story, comment, job, or poll) by its numeric id, including full text. |
| `search_stories` | `query` (string), `limit` (1-50, default 10) | Full-text search across Hacker News stories via Algolia, sorted by relevance. |

All tools validate input with [zod](https://zod.dev), use a 10-second request timeout, and return readable plain-text results.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake over stdio, lists the tools, and makes live API calls:

```bash
npm run smoke      # or: node smoke-test.mjs
```

Expected output ends with `PASS`.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hackernews": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-hackernews/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

- "What are the top 5 stories on Hacker News right now?"
- "Search Hacker News for stories about local-first software."
- "Show me HN item 8863."

## Development

```bash
npm run dev        # run from source with tsx (no build step)
```

## Architecture

- `src/api.ts` — pure data layer (fetch logic, timeouts, error handling). No MCP imports, so it is independently testable.
- `src/index.ts` — MCP server: registers the three tools and formats results. Logs go to **stderr** only; **stdout** is reserved for the MCP protocol.
- `smoke-test.mjs` — live end-to-end test using the MCP client SDK.

## Notes

- The Firebase API is read-only and unauthenticated. Deleted/dead items are filtered out of top-stories results.
- `created_at` timestamps from search are UTC.
- Requires Node.js 20+ (uses the global `fetch`).

## License

MIT
