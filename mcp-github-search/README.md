# mcp-github-search

A small, polished [Model Context Protocol](https://modelcontextprotocol.io) server that lets an LLM search GitHub — repositories, code, and users — through the public GitHub REST search API.

No authentication is required. Unauthenticated search is rate-limited (about 10 requests/minute); set an optional `GITHUB_TOKEN` to raise the limit.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_repos` | `query` (string), `sort?` (`stars` \| `forks` \| `help-wanted-issues` \| `updated` \| `best-match`) | Search public repositories. Supports GitHub qualifiers like `language:typescript stars:>1000`. |
| `search_code` | `query` (string) | Search code across public repositories. Supports `repo:owner/name`, `language:python`, `filename:Dockerfile`, etc. |
| `search_users` | `query` (string) | Search users and organizations. Supports `type:org`, `location:berlin`, `followers:>1000`, etc. |

All tools return up to 10 results as readable text including names, links, and metadata.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake against the built server, lists tools, and makes one live GitHub call:

```bash
npm run build && node smoke-test.mjs
# -> prints sample data and "PASS"
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github-search": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-github-search/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_optional_token_to_raise_rate_limits"
      }
    }
  }
}
```

The `env` block is optional. Restart Claude Desktop after editing the config, then ask things like “search GitHub for the most-starred MCP servers.”

## Development

```bash
npm run dev      # run from TypeScript source via tsx
npm run build    # compile to dist/
npm start        # run the compiled server
```

## Design notes

- Core API logic lives in `src/api.ts` with **no MCP imports**, so it is reusable and testable on its own.
- Uses Node's global `fetch` with a hard 10s timeout via `AbortController`.
- All logging goes to **stderr**; stdout carries only MCP protocol frames.
- Errors (timeouts, rate limits, non-2xx responses) are surfaced as clean MCP error results with actionable messages.

## License

MIT
