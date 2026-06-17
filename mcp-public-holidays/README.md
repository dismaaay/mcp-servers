# mcp-public-holidays

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any MCP-compatible client — Claude Desktop, Claude Code, etc. — instant access to **public-holiday data for 100+ countries**.

It wraps the free [Nager.Date](https://date.nager.at) API. **No API key, no signup, no rate-limit headaches.**

## Tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `holidays` | `year` (number), `countryCode` (ISO-3166 alpha-2) | Lists every public holiday for a year and country. |
| `next_holidays` | `countryCode` | Lists the upcoming public holidays (next ~365 days). |
| `is_holiday` | `date` (`YYYY-MM-DD`), `countryCode` | Tells you whether a specific date is a public holiday, and names it. |

`countryCode` is a 2-letter ISO 3166-1 alpha-2 code such as `US`, `GB`, `PL`, `DE`, `FR`, `JP`. Input is case-insensitive and validated before any network call.

### Example output

```
holidays(2026, "PL")
→ Public holidays in PL for 2026 (14):
  2026-01-01  New Year's Day (Nowy Rok)
  2026-01-06  Epiphany (Święto Trzech Króli)
  2026-04-05  Easter Sunday (Wielkanoc)
  ...

is_holiday("2026-12-25", "PL")
→ Yes — 2026-12-25 is a public holiday in PL: Christmas Day (local name: Boże Narodzenie).
```

## Install & build

Requires **Node.js 20+** (uses the global `fetch`).

```bash
npm install
npm run build      # compiles TypeScript to dist/
npm run smoke      # live end-to-end test against the real API — prints PASS
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "public-holidays": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-public-holidays/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"What public holidays does Germany have in 2026?"* or *"Is 2026-07-04 a holiday in the US?"*

## Use with Claude Code

```bash
claude mcp add public-holidays -- node /Users/samsung/mcp-catalog/mcp-public-holidays/dist/index.js
```

## Design notes

- **Transport:** stdio. `stdout` carries the MCP protocol; all logging goes to `stderr` only.
- **Testable core:** all network logic lives in [`src/api.ts`](src/api.ts), which has **zero** MCP imports, so it can be reused or unit-tested independently. [`src/index.ts`](src/index.ts) only wires those functions to MCP tools.
- **Robust:** every request has a 10-second timeout (`AbortController`), inputs are zod-validated, and API/network errors are returned as clean, human-readable tool errors instead of crashing the server.

## License

MIT
