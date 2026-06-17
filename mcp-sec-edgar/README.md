# mcp-sec-edgar

A [Model Context Protocol](https://modelcontextprotocol.io) server for **SEC EDGAR**.
Look up public companies, list their most recent filings, and fetch headline XBRL
financial facts — all from the official SEC EDGAR APIs. **No API key required.**

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Tools

| Tool | Description |
| --- | --- |
| `lookup_company(ticker_or_name, limit?)` | Resolve a ticker (e.g. `AAPL`) or company name (e.g. `apple`) to SEC records, including the zero-padded 10-digit CIK. |
| `get_recent_filings(ticker_or_name, limit?)` | List a company's most recent EDGAR filings (form type, date, accession number, and a direct document link). |
| `get_company_facts(ticker_or_name)` | Fetch headline XBRL facts (Revenues, Net Income, Assets, Liabilities, Stockholders' Equity, Cash, EPS, shares outstanding). |

### Data sources

- `https://www.sec.gov/files/company_tickers.json` — ticker → CIK directory
- `https://data.sec.gov/submissions/CIK##########.json` — recent filings
- `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` — XBRL facts

## Requirements

- Node.js 18+ (uses the global `fetch` API)

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a live MCP handshake, lists tools, and makes one real SEC API call:

```bash
node smoke-test.mjs
```

Expected: prints discovered tools, sample Apple Inc. filings, and `PASS`.

## SEC User-Agent (important)

SEC requires a **descriptive User-Agent** containing a contact email on every
request; requests without one (or with a URL in the string) are rejected with
HTTP 403. This server defaults to `mcp-sec-edgar contact@example.com`. Set your
own contact info so SEC can reach you if needed:

```bash
export SEC_EDGAR_USER_AGENT="your-app-name your-email@example.com"
```

Please also respect SEC's [fair-access rate limit](https://www.sec.gov/os/webmaster-faq#developers)
of no more than 10 requests/second.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sec-edgar": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-sec-edgar/dist/index.js"],
      "env": {
        "SEC_EDGAR_USER_AGENT": "your-app-name your-email@example.com"
      }
    }
  }
}
```

Restart Claude Desktop, then try:

> "Look up Apple on SEC EDGAR and show its most recent filings."

## Example output

`get_recent_filings("AAPL", 3)`:

```
Apple Inc. (AAPL, CIK 0000320193) — 3 recent filing(s):
2026-05-29  4        FORM 4
   https://www.sec.gov/Archives/edgar/data/320193/000114036126023363/xslF345X06/form4.xml
2026-05-28  SD       SD
   https://www.sec.gov/Archives/edgar/data/320193/000114036126023149/ef20073373_sd.htm
...
```

## Project layout

```
src/
  api.ts      Core SEC EDGAR logic (no MCP imports — reusable/testable)
  index.ts    MCP server: tool registration + stdio transport
smoke-test.mjs  Live end-to-end protocol + API test
```

## License

MIT
