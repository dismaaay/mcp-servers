# mcp-github-public

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes the **public GitHub REST API** to any MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.).

No GitHub token required — it uses the unauthenticated GitHub API, so it's rate-limited (~60 requests/hour per IP) but works out of the box for reading public users, repositories, and search.

## Tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `get_user` | `username` | Fetch a public user/org profile: name, bio, company, location, repo & follower counts, profile URL. |
| `get_repo` | `owner`, `repo` | Fetch a single public repository: description, stars, forks, language, license, topics, URLs. |
| `list_repos` | `username`, `per_page?` (1–100, default 30) | List a user's public repos, sorted by most recently pushed. |
| `search_repos` | `query`, `per_page?` (1–50, default 10) | Search public repos sorted by stars. Supports GitHub qualifiers like `language:typescript` or `stars:>1000`. |

All tools enforce a 10-second request timeout, validate inputs with [zod](https://zod.dev), and return human-readable text (including clear errors for not-found and rate-limit conditions).

## Install & build

```bash
npm install
npm run build
```

## Verify it works (live)

```bash
npm run smoke
```

This spawns the server over stdio, performs the MCP handshake, lists the tools, and makes real calls against the live GitHub API. It prints `PASS` on success.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github-public": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-github-public/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"Use the github-public tools to show me Linus Torvalds' profile"* or *"Search GitHub for popular TypeScript MCP servers."*

## Claude Code configuration

```bash
claude mcp add github-public -- node /absolute/path/to/mcp-github-public/dist/index.js
```

## Architecture

- `src/api.ts` — pure GitHub API client and text formatters with **zero MCP dependencies** (independently testable/reusable).
- `src/index.ts` — MCP server wiring: registers the four tools over stdio. All logs go to **stderr**; stdout carries the protocol.
- `smoke-test.mjs` — end-to-end live test using the MCP SDK client.

## Rate limits

The unauthenticated GitHub API allows roughly 60 requests/hour per IP (10/min for search). When exhausted, the tools return a clear error that includes the reset time. For higher limits you would add a token via an `Authorization` header — intentionally out of scope for this public, no-auth server.

## License

MIT
