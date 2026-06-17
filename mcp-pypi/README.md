# mcp-pypi

An [MCP](https://modelcontextprotocol.io) server that wraps the public
**PyPI JSON API** (`https://pypi.org/pypi/<package>/json`) so LLMs and MCP
clients can look up Python package metadata and release history.

No API key required.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `get_package` | `name: string` | Current metadata for a package: latest version, summary, author, license, required Python, dependencies, project URLs, release count, known vulnerabilities. |
| `get_releases` | `name: string`, `limit?: number` (default 25, max 200) | Release history, newest first: version, upload date, file count, distribution types (sdist/wheel), and yanked status. |

Each tool returns a human-readable text block plus a structured JSON block.

## Quick start

```bash
npm install
npm run build
node smoke-test.mjs   # live handshake + real PyPI calls; prints PASS
```

### Example

```
get_package({ name: "requests" })
get_releases({ name: "requests", limit: 5 })
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pypi": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-pypi/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should then be able to ask things like
*"What's the latest version of `httpx` on PyPI and what does it depend on?"*

## Development

```bash
npm run dev    # run from TypeScript source via tsx
npm run build  # compile to dist/
npm start      # run the compiled server
```

The server speaks MCP over **stdio**. All logs go to **stderr** only, so the
JSON-RPC stream on stdout is never corrupted.

## Architecture

- `src/api.ts` — pure PyPI client (no MCP imports). Handles validation,
  10s request timeout, 404 → `PackageNotFoundError`, and version sorting.
- `src/index.ts` — MCP server: registers the two tools with `zod` input
  schemas and maps errors to clean MCP error results.
- `smoke-test.mjs` — spawns the built server, performs the handshake, lists
  tools, makes real calls, and asserts on live data.

## License

MIT
