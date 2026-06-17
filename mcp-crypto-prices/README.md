# mcp-crypto-prices

A small, dependency-light **Model Context Protocol (MCP)** server that gives any MCP
client (Claude Desktop, Claude Code, etc.) live cryptocurrency data from the free
[CoinGecko API](https://www.coingecko.com/en/api) — **no API key required**.

Built with the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
and [`zod`](https://zod.dev) for input validation. Network calls have a 10s timeout
and clear error handling (including CoinGecko rate-limit detection).

## Tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `get_price` | `ids: string[]`, `vs_currency: string = "usd"` | Current price, market cap, and 24h change for each coin. |
| `trending` | _(none)_ | The coins currently trending on CoinGecko (most searched, last 24h). |
| `market_top` | `limit: number = 10` (1–250), `vs_currency: string = "usd"` | Top coins by market capitalisation with price and 24h change. |

> Use CoinGecko **coin ids** (e.g. `bitcoin`, `ethereum`, `solana`) — not ticker
> symbols like `btc`.

### Example output

```
bitcoin:
  price:      64,815 USD
  market cap: 1,299,427,526,641 USD
  24h change: -2.50%

ethereum:
  price:      1,770.26 USD
  market cap: 213,665,945,322 USD
  24h change: -1.01%
```

## Install & build

```bash
npm install
npm run build      # tsc -> dist/
```

## Run the smoke test

The smoke test spawns the built server, connects a real MCP client over stdio,
lists the tools, and makes a live `get_price` call against CoinGecko:

```bash
npm test           # build + smoke test, prints PASS
# or, after building:
node smoke-test.mjs
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "crypto-prices": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-crypto-prices/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask things like:

- "What's the price of bitcoin and ethereum in EUR?"
- "What crypto is trending right now?"
- "Show me the top 10 coins by market cap."

## Use with Claude Code

```bash
claude mcp add crypto-prices -- node /absolute/path/to/mcp-crypto-prices/dist/index.js
```

## Project layout

```
src/api.ts        Core CoinGecko client + formatters (no MCP imports — unit-testable)
src/index.ts      MCP server: registers the three tools over stdio
smoke-test.mjs    Live end-to-end protocol test
```

## Notes

- The CoinGecko free tier is rate-limited (~10–30 requests/min). The server reports
  HTTP 429 as a friendly "rate limit hit" message.
- The server writes the MCP protocol to **stdout** only; all logs go to **stderr**.

## License

MIT
