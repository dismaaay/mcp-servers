# mcp-dictionary

A small, dependency-light [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any MCP client (Claude Desktop, Claude Code, etc.) the ability to look up English word definitions and synonyms.

It wraps the free, no-key [Free Dictionary API](https://dictionaryapi.dev/) (`https://api.dictionaryapi.dev`).

## Tools

| Tool | Argument | What it returns |
| --- | --- | --- |
| `define` | `word: string` | Definitions grouped by part of speech, with examples and phonetics. |
| `synonyms` | `word: string` | Synonyms grouped by part of speech. |

Both tools call the live API with a 10-second timeout and return clean, readable plain text. Word-not-found, network errors, and timeouts are reported as friendly tool errors rather than crashing.

## Requirements

- Node.js 20 or newer (uses the global `fetch`).

## Install & build

```bash
npm install
npm run build
```

## Verify it works (live smoke test)

```bash
npm run smoke    # or: node smoke-test.mjs
```

This launches the built server over stdio with a real MCP client, lists the tools, and makes a live `define("serendipity")` call against the API. It prints `PASS` on success.

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dictionary": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-dictionary/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"define serendipity"* or *"what are synonyms for happy?"* and Claude will call these tools.

## Use with Claude Code

```bash
claude mcp add dictionary -- node /Users/samsung/mcp-catalog/mcp-dictionary/dist/index.js
```

## Project layout

```
src/api.ts        Core fetch + formatting logic (no MCP imports — unit-testable).
src/index.ts      MCP server: registers the `define` and `synonyms` tools over stdio.
smoke-test.mjs    Live end-to-end protocol + API test.
```

## Design notes

- **stdout is the protocol.** All logging goes to **stderr** so it never corrupts the JSON-RPC stream.
- The Free Dictionary API exposes synonyms at both the *meaning* level and the *individual definition* level; `synonyms` merges and de-duplicates both.
- A not-found word returns a JSON object (not an array); the client distinguishes this from a successful array response and surfaces a clear "No definitions found" message.

## License

MIT. Definition data is provided by the [Free Dictionary API](https://dictionaryapi.dev/) under its respective licenses.
