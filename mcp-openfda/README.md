# mcp-openfda

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that
wraps the U.S. Food & Drug Administration's [openFDA API](https://open.fda.gov/apis/).
It lets any MCP-capable client (Claude Desktop, IDEs, agents) search FDA drug
labels, summarize adverse-event reports, and look up drug recalls — all from
official, public FDA data. **No API key required.**

> ⚠️ **Disclaimer:** openFDA data is for informational use only. Do not rely on
> it to make medical decisions. See the [openFDA terms](https://open.fda.gov/terms/).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `search_drug_labels` | `query` (string), `limit?` (1–25, default 5) | Search FDA structured product labeling. Returns brand/generic name, manufacturer, purpose, indications, warnings, and dosage. |
| `drug_adverse_events` | `drug` (string), `limit?` (1–50, default 10) | Summarize the most frequently reported adverse-event reactions for a drug from the FAERS database, with total report count. |
| `search_recalls` | `query` (string), `limit?` (1–25, default 5) | Search FDA drug enforcement (recall) reports by drug name, firm, or reason. |

### Example output

`drug_adverse_events({ drug: "aspirin", limit: 3 })`:

```json
{
  "drug": "aspirin",
  "total_reports": 609471,
  "top_reactions": [
    { "reaction": "FATIGUE", "count": 38024 },
    { "reaction": "DYSPNOEA", "count": 31827 },
    { "reaction": "NAUSEA", "count": 31450 }
  ]
}
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a live MCP handshake, lists tools, and makes one real openFDA call:

```bash
npm run smoke
# -> [smoke] handshake OK
# -> [smoke] tools: drug_adverse_events, search_drug_labels, search_recalls
# -> PASS
```

## Claude Desktop configuration

Add the server to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "openfda": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-openfda/dist/index.js"]
    }
  }
}
```

Use the absolute path to `dist/index.js` on your machine. Restart Claude
Desktop, then ask things like *"What are the most reported side effects of
ibuprofen?"* or *"Are there any recalls for metformin?"*

## Architecture

- `src/api.ts` — pure openFDA HTTP client (no MCP imports). Node global
  `fetch`, a 10-second timeout, a descriptive `User-Agent`, and consistent
  error handling.
- `src/index.ts` — MCP server: registers the three tools with zod input schemas
  and connects over stdio. All logs go to stderr to keep stdout a clean
  JSON-RPC channel.
- `smoke-test.mjs` — live end-to-end protocol + API verification.

## Development

```bash
npm run dev    # run from source with tsx
npm run build  # compile to dist/
npm start      # run the compiled server
```

## License

MIT
