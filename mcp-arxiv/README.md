# mcp-arxiv

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets
LLM clients search and read papers from [arXiv](https://arxiv.org). It wraps the
public [arXiv API](https://info.arxiv.org/help/api/index.html) (Atom XML, **no API
key required**) and exposes two clean tools.

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_papers` | `query` (string, required), `max` (int 1–50, default 10) | Search arXiv across all fields and return a ranked list of papers with ids, authors, categories and links. |
| `get_paper` | `arxiv_id` (string, required) | Fetch full metadata and the complete abstract for one paper. Accepts bare ids (`1706.03762`), versioned ids (`1706.03762v7`), old-style ids (`cond-mat/0011267`), or a full `arxiv.org` URL. |

### Example output

`search_papers({ query: "attention is all you need", max: 3 })`:

```
Found 3 arXiv papers for "attention is all you need":

1. Attention Is All You Need
   arXiv:1706.03762  (2017)  [cs.CL, cs.LG]
   Authors: Ashish Vaswani, Noam Shazeer, Niki Parmar, et al.
   https://arxiv.org/abs/1706.03762v7
...
```

`get_paper({ arxiv_id: "1706.03762" })` returns the title, authors, dates,
categories, links and the full abstract text.

## Requirements

- Node.js **20+** (uses the global `fetch`).

## Install & build

```bash
npm install
npm run build      # compiles TypeScript to dist/
```

## Smoke test (live)

Verifies the server boots, completes an MCP handshake over stdio, lists its tools,
and makes real calls against the live arXiv API:

```bash
npm run build
node smoke-test.mjs   # prints PASS on success
```

## Run

```bash
npm start            # node dist/index.js  (stdio transport)
# or during development:
npm run dev          # tsx src/index.ts
```

The server speaks MCP over **stdio**: `stdout` carries the protocol, and all logs
go to `stderr`.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "arxiv": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-arxiv/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"search arXiv for recent
papers on retrieval-augmented generation"* or *"summarise arXiv paper 2310.06825"*.

## Project layout

```
src/api.ts        Core arXiv client + Atom parsing + formatting (no MCP imports — unit-testable)
src/index.ts      MCP server: registers tools, wires stdio transport
smoke-test.mjs    Live end-to-end protocol + API test
```

## Notes

- Requests use a hard **10-second timeout** (via `AbortController`) and surface
  clear errors (timeouts, network failures, bad ids, no results) as tool errors
  rather than crashing the server.
- Please be considerate of arXiv's API: it asks clients to keep request volume
  modest. See the [API terms of use](https://info.arxiv.org/help/api/tou.html).

## License

MIT — see [LICENSE](./LICENSE).
