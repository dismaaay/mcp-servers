# mcp-open-food-facts

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives any MCP-compatible client (Claude Desktop, Claude Code, etc.) live access to [**Open Food Facts**](https://world.openfoodfacts.org) — the free, open, crowdsourced database of food products from around the world.

Look up any food product by its barcode, or search the database by name, brand, or keyword. Get ingredients, Nutri-Score, NOVA processing group, Eco-Score, and a full per-100g nutrition breakdown. **No API key required.**

## Tools

### `get_product(barcode)`

Look up a single product by its barcode (EAN/UPC).

| Argument  | Type   | Required | Description                                    |
| --------- | ------ | -------- | ---------------------------------------------- |
| `barcode` | string | yes      | Numeric barcode, e.g. `3017620422003` (Nutella) |

Returns name, brand(s), quantity, categories, Nutri-Score, NOVA group, Eco-Score, labels, ingredients, countries of sale, an image URL, and a per-100g nutrition table.

**Example output:**

```
Nutella
Barcode: 3017620422003
Brand(s): Nutella, Yum yum
Scores: Nutri-Score E | NOVA group 4 (1=unprocessed … 4=ultra-processed)
Ingredients: Sucre, huile de palme, NOISETTES 13%, cacao maigre 7,4%, ...
Nutrition (per 100g):
  Energy: 539 kcal
  Fat: 30.9 g
    of which saturated: 10.6 g
  Carbohydrates: 57.5 g
    of which sugars: 56.3 g
  Proteins: 6.3 g
  Salt: 0.11 g
```

### `search_products(query, limit?)`

Full-text search across the database.

| Argument | Type   | Required | Description                                        |
| -------- | ------ | -------- | -------------------------------------------------- |
| `query`  | string | yes      | Search terms, e.g. `organic peanut butter`         |
| `limit`  | number | no       | Max results to return, 1–50 (default 10)           |

Returns a ranked list of matches with name, barcode, brand(s), quantity, and Nutri-Score. Feed a returned barcode into `get_product` for full details.

> The search tool tries Open Food Facts' main search endpoint first and transparently falls back to the dedicated [search-a-licious](https://search.openfoodfacts.org) service if the main one is temporarily overloaded.

## Installation

```bash
git clone https://github.com/mcp-catalog/mcp-open-food-facts.git
cd mcp-open-food-facts
npm install
npm run build
```

Requires **Node.js 20+** (uses the built-in global `fetch`).

## Verify it works

```bash
npm run smoke
```

This spawns the built server, completes an MCP handshake over stdio, lists the tools, and makes a real call against the live Open Food Facts API. It prints `PASS` on success.

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-food-facts": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-open-food-facts/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

- *"What's in Nutella? Barcode 3017620422003."*
- *"Search Open Food Facts for organic peanut butter and compare their Nutri-Scores."*

## Development

```bash
npm run dev     # run from source with tsx (no build step)
npm run build   # compile TypeScript → dist/
npm run smoke   # live end-to-end smoke test
```

### Project layout

```
src/
  api.ts        # Pure Open Food Facts client — no MCP deps, independently testable
  index.ts      # MCP server: registers tools, formats results
smoke-test.mjs  # Live handshake + real tool-call test
```

All diagnostic logging goes to **stderr**; **stdout** carries only the MCP protocol.

## Notes & limits

- Open Food Facts asks clients to send a descriptive `User-Agent`; this server does so automatically. Please be considerate with request volume.
- Data is crowdsourced, so completeness varies by product (especially Eco-Score and some nutriment fields).
- Requests time out after 10 seconds.

## License

MIT. Data provided by [Open Food Facts](https://world.openfoodfacts.org) under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).
