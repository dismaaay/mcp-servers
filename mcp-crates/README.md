# mcp-crates

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the
[crates.io](https://crates.io) Rust package registry. It lets any MCP-compatible
client — Claude Desktop, Claude Code, Cursor, etc. — look up crate metadata and
search the registry. No API key required.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `get_crate` | `name` (string) | Detailed metadata for one crate: description, latest version, download counts, repository, docs, keywords, and recent published versions. |
| `search_crates` | `query` (string), `limit` (number, 1–100, optional, default 10) | Free-text search of the registry, ranked by relevance with descriptions, versions, and download counts. |

## Install & build

```bash
npm install
npm run build
```

## Try it (live smoke test)

Performs a real MCP handshake, lists the tools, and makes live calls to
crates.io:

```bash
node smoke-test.mjs
```

You should see `PASS` along with real data for the `serde` crate.

## Use with Claude Desktop

Add the following to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "crates": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-crates/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

> What's the latest version of `tokio` and how many downloads does it have?
>
> Search crates.io for an async HTTP client.

## Use with Claude Code

```bash
claude mcp add crates -- node /Users/samsung/mcp-catalog/mcp-crates/dist/index.js
```

## How it works

- **`src/api.ts`** — a dependency-light client for the crates.io REST API
  (`https://crates.io/api/v1`). Contains **no MCP imports**, uses the Node global
  `fetch`, enforces a 10-second timeout, and throws clear errors. Reusable on its
  own.
- **`src/index.ts`** — the MCP server. Registers the two tools with
  [zod](https://zod.dev) input schemas, formats results as readable text, and
  speaks the protocol over stdio. All logging goes to **stderr**; stdout is
  reserved for the JSON-RPC stream.

## Development

```bash
npm run dev    # run from source with tsx
npm run build  # compile TypeScript to dist/
npm start      # run the built server
```

## Data & attribution

Data comes from the public [crates.io API](https://crates.io/data-access).
Requests send a descriptive `User-Agent` as crates.io requests. This project is
not affiliated with the Rust Foundation or crates.io.

## License

MIT
