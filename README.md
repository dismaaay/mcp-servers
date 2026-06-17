# MCP Servers Catalog

A growing catalog of **production-ready, tested [Model Context Protocol](https://modelcontextprotocol.io) servers** — connect Claude / Cursor to real APIs and data. Every server is TypeScript, typed with zod, and verified with a live protocol handshake against the real API.

| # | Server | Connects to |
|---|---|---|
| 1 | [`mcp-air-quality`](mcp-air-quality/) | Model Context Protocol server for real-time air quality data via the Open-Meteo Air Quality API (no API key required). |
| 2 | [`mcp-arxiv`](mcp-arxiv/) | Model Context Protocol server for searching and fetching papers from arXiv. |
| 3 | [`mcp-countries`](mcp-countries/) | Model Context Protocol server for the REST Countries API. Look up country details, list countries by region, and resolve land borders. |
| 4 | [`mcp-crates`](mcp-crates/) | Model Context Protocol server for the crates.io Rust package registry. Look up crate metadata and search crates from any MCP client. |
| 5 | [`mcp-crypto-prices`](mcp-crypto-prices/) | Model Context Protocol server exposing live cryptocurrency prices, trending coins, and top markets via the free CoinGecko API. |
| 6 | [`mcp-dev-utils`](mcp-dev-utils/) | Model Context Protocol server exposing common developer utilities: UUID generation, hashing, base64, JWT decode, and timestamp conversion. Pure local, no network. |
| 7 | [`mcp-dictionary`](mcp-dictionary/) | Model Context Protocol server that wraps the Free Dictionary API. Exposes `define` and `synonyms` tools for any English word. |
| 8 | [`mcp-dns`](mcp-dns/) | DNS lookup MCP server using Cloudflare DNS-over-HTTPS (no API key required). Provides resolve and reverse DNS tools over the Model Context Protocol. |
| 9 | [`mcp-dockerhub`](mcp-dockerhub/) | Model Context Protocol server for the Docker Hub public API. Inspect image repositories and list tags with no API key required. |
| 10 | [`mcp-earthquakes`](mcp-earthquakes/) | Model Context Protocol server exposing real-time earthquake data from the USGS FDSN event API (no API key required). |
| 11 | [`mcp-exchange-rates`](mcp-exchange-rates/) | Model Context Protocol server for live and historical foreign-exchange rates, powered by the free Frankfurter API (European Central Bank data). Exposes convert, latest, and history tools. |
| 12 | [`mcp-geocode`](mcp-geocode/) | Geocoding MCP server wrapping OpenStreetMap Nominatim. Exposes geocode (address -> coordinates) and reverse (coordinates -> address) tools. |
| 13 | [`mcp-github-public`](mcp-github-public/) | Model Context Protocol server exposing the public GitHub REST API (users, repos, search) — no authentication required. |
| 14 | [`mcp-github-search`](mcp-github-search/) | MCP server for searching GitHub repositories, code, and users via the GitHub REST search API (no auth required). |
| 15 | [`mcp-hackernews`](mcp-hackernews/) | Model Context Protocol server for Hacker News — top stories, individual items, and full-text search via the Firebase and Algolia APIs. |
| 16 | [`mcp-ip-geo`](mcp-ip-geo/) | Model Context Protocol server for IP geolocation, powered by the free ipapi.co API. |
| 17 | [`mcp-npm`](mcp-npm/) | Model Context Protocol server for the npm registry: inspect packages, search, and view download stats. |
| 18 | [`mcp-open-food-facts`](mcp-open-food-facts/) | Model Context Protocol server for Open Food Facts — look up food products by barcode and search the global food database, no API key required. |
| 19 | [`mcp-open-library`](mcp-open-library/) | Model Context Protocol server for the Open Library API — search books, look up editions by ISBN, and list an author's works. No API key required. |
| 20 | [`mcp-pokeapi`](mcp-pokeapi/) | Model Context Protocol server for PokeAPI — look up Pokemon, types, and browse the Pokedex. |
| 21 | [`mcp-public-apis`](mcp-public-apis/) | MCP server for the Public APIs Directory — search 1500+ free public APIs and browse categories, no API key required. |
| 22 | [`mcp-public-holidays`](mcp-public-holidays/) | Model Context Protocol server exposing public-holiday data for 100+ countries via the free Nager.Date API (no API key required). |
| 23 | [`mcp-pypi`](mcp-pypi/) | MCP server wrapping the PyPI JSON API: look up Python package metadata and release history. |
| 24 | [`mcp-quotes`](mcp-quotes/) | Model Context Protocol server for inspirational quotes. Exposes random_quote, search_quotes, and quotes_by_author tools backed by a live, key-free quotes API. |
| 25 | [`mcp-rss`](mcp-rss/) | MCP server that fetches and parses any RSS or Atom feed URL (no API key required). |
| 26 | [`mcp-sitemap`](mcp-sitemap/) | MCP server that fetches and parses sitemap.xml URLs (no API key required) |
| 27 | [`mcp-stackexchange`](mcp-stackexchange/) | Model Context Protocol server for the Stack Exchange API (Stack Overflow). Search questions and fetch answers from the command line or any MCP client. |
| 28 | [`mcp-url-metadata`](mcp-url-metadata/) | MCP server that fetches any URL and extracts its title, meta description, and OpenGraph tags. No API key required. |
| 29 | [`mcp-whois-rdap`](mcp-whois-rdap/) | MCP server for domain RDAP/WHOIS lookups via rdap.org (no API key required) |
| 30 | [`mcp-wikipedia`](mcp-wikipedia/) | Model Context Protocol server for Wikipedia: search articles, fetch summaries, and read full article text via the public Wikipedia REST/Action APIs. No API key required. |
| 31 | [`mcp-worldtime`](mcp-worldtime/) | Model Context Protocol server for world time and timezone lookups (worldtimeapi.org, no API key). |

**31 servers and counting** (target: 100). Run any: `cd <server> && npm install && npm run build && node smoke-test.mjs`.

## Use in Claude Desktop
Each server's README has the exact `claude_desktop_config.json` snippet.

## License
MIT.
