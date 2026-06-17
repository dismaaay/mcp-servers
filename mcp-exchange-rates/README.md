# mcp-exchange-rates

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives any
MCP-compatible client (Claude Desktop, Claude Code, etc.) live and historical
foreign-exchange rates.

Data comes from [Frankfurter](https://frankfurter.dev) — a free, **no-API-key**
service backed by European Central Bank reference rates.

## Tools

| Tool      | Arguments                                   | What it does |
|-----------|---------------------------------------------|--------------|
| `convert` | `amount` (number), `from` (ISO code), `to` (ISO code) | Convert an amount between two currencies at the latest rate. |
| `latest`  | `base` (ISO code, optional — default `EUR`) | Latest rates for a base currency against all supported currencies. |
| `history` | `from`, `to` (ISO codes), `date` (`YYYY-MM-DD`), `base` (optional alias for `from`) | The exchange rate on a specific past date. Weekends/holidays snap to the nearest business day. |

Currency codes are 3-letter [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217)
codes such as `USD`, `EUR`, `GBP`, `JPY`, `PLN`.

### Example results

```
convert(amount=100, from="USD", to="EUR")
→ 100 USD = 86.25 EUR
  Rate: 1 USD = 0.862500 EUR (as of 2026-06-16)

latest(base="GBP")
→ Latest rates for GBP (as of 2026-06-16):
    1 GBP = 1.8979 AUD
    1 GBP = 1.2675 USD
    ...

history(from="USD", to="EUR", date="2024-01-02")
→ On 2024-01-02: 1 USD = 0.91274 EUR
```

## Install & build

```bash
npm install
npm run build      # compiles TypeScript to dist/
```

## Run

```bash
npm start          # node dist/index.js  (speaks MCP over stdio)
```

The server communicates over **stdio**: stdout carries the MCP protocol, and all
logging goes to stderr.

## Smoke test

A live end-to-end test that performs a real protocol handshake and one real API
call:

```bash
npm run build
node smoke-test.mjs   # prints PASS on success
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "exchange-rates": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-exchange-rates/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask things like *"Convert 250 CHF to JPY"* or
*"What was the USD→EUR rate on 2020-03-16?"*.

If you publish/install it globally (`npm i -g mcp-exchange-rates`), you can use
the `mcp-exchange-rates` binary as the `command` instead.

## Project layout

```
src/api.ts        Frankfurter API client (no MCP deps — unit-testable)
src/index.ts      MCP server: registers convert / latest / history tools
smoke-test.mjs    Live stdio handshake + real tool call, asserts + prints PASS
```

## Notes

- 10-second request timeout on every API call, with clear error messages.
- Inputs are validated with [zod](https://zod.dev); invalid currency/date inputs
  return readable tool errors rather than crashing the server.
- `src/api.ts` deliberately imports nothing from the MCP SDK so the fetch logic
  can be tested in isolation.

## License

MIT
