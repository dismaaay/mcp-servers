# mcp-stackexchange

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any
MCP-compatible LLM client live access to **Stack Overflow** via the public
[Stack Exchange API 2.3](https://api.stackexchange.com/docs). No API key required.

Ask your assistant to search Stack Overflow and read the top answers — grounded in
real, current community knowledge instead of the model's training data.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_questions` | `query` (string, required), `limit` (int 1–50, optional, default 10) | Search Stack Overflow questions by free text, sorted by relevance. Returns titles, scores, answer counts, tags, links, and question ids. |
| `get_answers` | `question_id` (int, required), `limit` (int 1–30, optional, default 5) | Fetch the top-voted answers for a question id, sorted by score, including the answer body. |

Typical flow: call `search_questions` to find a `question_id`, then `get_answers`
with that id to read the solutions.

## Install & build

```bash
npm install
npm run build
```

## Run the smoke test (live)

Verifies the MCP handshake, lists tools, and makes two real calls against the
Stack Exchange API:

```bash
npm run smoke
# → PASS — handshake, tool list, and 2 live API calls all succeeded.
```

## Run the server

The server speaks MCP over **stdio** (stdout = protocol, stderr = logs):

```bash
npm start
# [mcp-stackexchange] running on stdio
```

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "stackexchange": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-stackexchange/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should see the `search_questions` and `get_answers`
tools available. Try: *"Search Stack Overflow for how to merge two dictionaries
in Python, then show me the accepted answer."*

## Project layout

```
src/api.ts        Stack Exchange API client (no MCP imports, 10s timeout, clear errors)
src/index.ts      MCP server: registers the two tools over stdio
smoke-test.mjs    Live protocol + API smoke test
```

## Notes

- Targets the `stackoverflow` site. The Stack Exchange API allows up to 300
  unauthenticated requests per IP per day; the server logs a stderr warning when
  the remaining quota is low.
- Answer HTML is converted to readable plain text.

## License

MIT
