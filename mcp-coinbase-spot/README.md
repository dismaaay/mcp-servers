# mcp-coinbase-spot

An [MCP](https://modelcontextprotocol.io) server that exposes **Coinbase's public
market-data endpoints** — no API key required. It gives any MCP-compatible client
(Claude Desktop, Claude Code, etc.) live crypto/fiat spot prices and exchange rates.

Built on the official [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
and the public Coinbase v2 API (`https://api.coinbase.com/v2`).

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `spot_price` | `pair: string` | Current Coinbase spot price for a trading pair. Accepts a bare base asset (`BTC` → defaults quote to USD) or a full pair (`ETH-EUR`, `BTC/GBP`, `sol-usd`). |
| `exchange_rates` | `currency: string` | Exchange rates for a base currency (fiat or crypto), e.g. `USD`, `EUR`, `BTC`. Returns a map of currency code → rate. |

### Example output

`spot_price("BTC-USD")`:

```
BTC/USD spot price: 64853.295 USD
{
  "amount": "64853.295",
  "base": "BTC",
  "currency": "USD"
}
```

`exchange_rates("USD")`:

```
Exchange rates for USD (300+ currencies). Examples: 1 USD = 0.86... EUR; 1 USD = ...
{ "currency": "USD", "rates": { "EUR": "...", "GBP": "...", "BTC": "...", ... } }
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Performs a real MCP handshake over stdio, lists tools, and makes one real
Coinbase API call:

```bash
npm run smoke   # or: node smoke-test.mjs
```

Expected tail:

```
[smoke] handshake OK
[smoke] tools: exchange_rates, spot_price
[smoke] REAL DATA: BTC-USD spot = <live price> USD
PASS
```

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "coinbase-spot": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-coinbase-spot/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like *"What's the spot price of
ETH in EUR?"* or *"Show me exchange rates for USD."*

### Claude Code

```bash
claude mcp add coinbase-spot -- node /Users/samsung/mcp-catalog/mcp-coinbase-spot/dist/index.js
```

## Architecture

- `src/api.ts` — pure Coinbase HTTP client. **No MCP imports**, so it is reusable
  and testable. Uses Node's global `fetch` with a 10s timeout, a descriptive
  `User-Agent` header, and typed error handling (`CoinbaseApiError`).
- `src/index.ts` — MCP server. Registers the two tools with `zod` input schemas,
  wraps each in error handling, and connects over `StdioServerTransport`. All logs
  go to **stderr** so stdout stays a clean JSON-RPC channel.
- `smoke-test.mjs` — end-to-end live test using the MCP `Client` + stdio transport.

## Notes

- These are **public** endpoints; no authentication, no rate-limit key needed.
- Prices are indicative spot values from Coinbase, not tradable quotes.

## License

MIT
