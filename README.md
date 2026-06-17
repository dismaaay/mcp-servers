# MCP Servers Catalog

A growing catalog of **production-ready, tested [Model Context Protocol](https://modelcontextprotocol.io) servers** — connect Claude / Cursor to real APIs. Each server is TypeScript, typed, and verified with a live protocol handshake against the real API.

| Server | What it connects |
|---|---|
| [`mcp-arxiv`](mcp-arxiv/) | Model Context Protocol server for searching and fetching papers from arXiv. |
| [`mcp-countries`](mcp-countries/) | Model Context Protocol server for the REST Countries API. Look up country details, list countries by region, and resolve land borders. |
| [`mcp-crypto-prices`](mcp-crypto-prices/) | Model Context Protocol server exposing live cryptocurrency prices, trending coins, and top markets via the free CoinGecko API. |
| [`mcp-dictionary`](mcp-dictionary/) | Model Context Protocol server that wraps the Free Dictionary API. Exposes `define` and `synonyms` tools for any English word. |
| [`mcp-earthquakes`](mcp-earthquakes/) | Model Context Protocol server exposing real-time earthquake data from the USGS FDSN event API (no API key required). |
| [`mcp-exchange-rates`](mcp-exchange-rates/) | Model Context Protocol server for live and historical foreign-exchange rates, powered by the free Frankfurter API (European Central Bank data). Exposes convert, latest, and history tools. |
| [`mcp-geocode`](mcp-geocode/) | Geocoding MCP server wrapping OpenStreetMap Nominatim. Exposes geocode (address -> coordinates) and reverse (coordinates -> address) tools. |
| [`mcp-github-public`](mcp-github-public/) | Model Context Protocol server exposing the public GitHub REST API (users, repos, search) — no authentication required. |
| [`mcp-hackernews`](mcp-hackernews/) | Model Context Protocol server for Hacker News — top stories, individual items, and full-text search via the Firebase and Algolia APIs. |
| [`mcp-ip-geo`](mcp-ip-geo/) | Model Context Protocol server for IP geolocation, powered by the free ipapi.co API. |
| [`mcp-open-food-facts`](mcp-open-food-facts/) | Model Context Protocol server for Open Food Facts — look up food products by barcode and search the global food database, no API key required. |
| [`mcp-open-library`](mcp-open-library/) | Model Context Protocol server for the Open Library API — search books, look up editions by ISBN, and list an author's works. No API key required. |
| [`mcp-pokeapi`](mcp-pokeapi/) | Model Context Protocol server for PokeAPI — look up Pokemon, types, and browse the Pokedex. |
| [`mcp-public-holidays`](mcp-public-holidays/) | Model Context Protocol server exposing public-holiday data for 100+ countries via the free Nager.Date API (no API key required). |
| [`mcp-quotes`](mcp-quotes/) | Model Context Protocol server for inspirational quotes. Exposes random_quote, search_quotes, and quotes_by_author tools backed by a live, key-free quotes API. |
| [`mcp-wikipedia`](mcp-wikipedia/) | Model Context Protocol server for Wikipedia: search articles, fetch summaries, and read full article text via the public Wikipedia REST/Action APIs. No API key required. |

**16 servers.** Each: `cd <server> && npm install && npm run build && node smoke-test.mjs`.

## Use in Claude Desktop
Add any server to `claude_desktop_config.json` — see each server's README for the exact snippet.

## License
MIT.
