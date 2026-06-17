# mcp-trivia

An [MCP](https://modelcontextprotocol.io) server that wraps the free
[Open Trivia DB](https://opentdb.com) (`opentdb.com`). No API key required.

Give your MCP client (Claude Desktop, etc.) the ability to fetch trivia
questions and list trivia categories.

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `get_questions` | `amount` (1-50, required), `category?` (number), `difficulty?` (`easy`\|`medium`\|`hard`), `type?` (`multiple`\|`boolean`) | Fetch trivia questions with shuffled options and the correct answer. |
| `list_categories` | _none_ | List all trivia categories with their numeric ids and names. |

Text fields (questions and answers) are returned HTML-decoded. All requests use
a 10s timeout and send a descriptive `User-Agent` header.

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake over stdio and makes a live API call:

```bash
node smoke-test.mjs
# -> Handshake OK
# -> Tools: get_questions, list_categories
# -> PASS
```

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "trivia": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-trivia/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. Then try prompts like:

- "List the trivia categories."
- "Give me 5 medium difficulty questions about Science: Computers (category 18)."
- "Ask me 3 true/false general knowledge questions."

## Development

```bash
npm run dev    # run from TypeScript source via tsx
npm run build  # compile to dist/
npm start      # run the compiled server
```

## Project layout

```
src/api.ts      Core Open Trivia DB client (no MCP imports, reusable/testable)
src/index.ts    MCP server: tool registration + stdio transport
smoke-test.mjs  Live protocol + API smoke test
```

## API reference

- Questions: `GET https://opentdb.com/api.php?amount=…&category=…&difficulty=…&type=…`
- Categories: `GET https://opentdb.com/api_category.php`

The server maps Open Trivia DB `response_code` values to descriptive errors
(e.g. code 1 = not enough questions for the query, code 5 = rate limited —
the API allows one request per IP every 5 seconds).

## License

MIT
