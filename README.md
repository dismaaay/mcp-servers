# MCP Servers Catalog

A growing catalog of **production-ready, tested [Model Context Protocol](https://modelcontextprotocol.io) servers** — connect Claude / Cursor to real APIs and data. Every server is TypeScript, zod-typed, and verified with a live protocol handshake against the real API.

| # | Server | Connects to |
|---|---|---|
| 1 | [`mcp-air-quality`](mcp-air-quality/) | Model Context Protocol server for real-time air quality data via the Open-Meteo Air Quality API (no API key required). |
| 2 | [`mcp-arxiv`](mcp-arxiv/) | Model Context Protocol server for searching and fetching papers from arXiv. |
| 3 | [`mcp-coinbase-spot`](mcp-coinbase-spot/) | MCP server exposing Coinbase public spot prices and exchange rates (no API key required). |
| 4 | [`mcp-countries`](mcp-countries/) | Model Context Protocol server for the REST Countries API. Look up country details, list countries by region, and resolve land borders. |
| 5 | [`mcp-crates`](mcp-crates/) | Model Context Protocol server for the crates.io Rust package registry. Look up crate metadata and search crates from any MCP client. |
| 6 | [`mcp-crypto-prices`](mcp-crypto-prices/) | Model Context Protocol server exposing live cryptocurrency prices, trending coins, and top markets via the free CoinGecko API. |
| 7 | [`mcp-datausa`](mcp-datausa/) | Model Context Protocol server for the Data USA API — query U.S. public data (population, demographics, economics) with no API key required. |
| 8 | [`mcp-dev-utils`](mcp-dev-utils/) | Model Context Protocol server exposing common developer utilities: UUID generation, hashing, base64, JWT decode, and timestamp conversion. Pure local, no network. |
| 9 | [`mcp-dictionary`](mcp-dictionary/) | Model Context Protocol server that wraps the Free Dictionary API. Exposes `define` and `synonyms` tools for any English word. |
| 10 | [`mcp-dns`](mcp-dns/) | DNS lookup MCP server using Cloudflare DNS-over-HTTPS (no API key required). Provides resolve and reverse DNS tools over the Model Context Protocol. |
| 11 | [`mcp-dockerhub`](mcp-dockerhub/) | Model Context Protocol server for the Docker Hub public API. Inspect image repositories and list tags with no API key required. |
| 12 | [`mcp-earthquakes`](mcp-earthquakes/) | Model Context Protocol server exposing real-time earthquake data from the USGS FDSN event API (no API key required). |
| 13 | [`mcp-exchange-rates`](mcp-exchange-rates/) | Model Context Protocol server for live and historical foreign-exchange rates, powered by the free Frankfurter API (European Central Bank data). Exposes convert, latest, and history tools. |
| 14 | [`mcp-geocode`](mcp-geocode/) | Geocoding MCP server wrapping OpenStreetMap Nominatim. Exposes geocode (address -> coordinates) and reverse (coordinates -> address) tools. |
| 15 | [`mcp-github-public`](mcp-github-public/) | Model Context Protocol server exposing the public GitHub REST API (users, repos, search) — no authentication required. |
| 16 | [`mcp-github-search`](mcp-github-search/) | MCP server for searching GitHub repositories, code, and users via the GitHub REST search API (no auth required). |
| 17 | [`mcp-gutenberg`](mcp-gutenberg/) | Model Context Protocol server for Project Gutenberg — search and retrieve 70,000+ free public-domain ebooks via the Gutendex API (no key required). |
| 18 | [`mcp-hackernews`](mcp-hackernews/) | Model Context Protocol server for Hacker News — top stories, individual items, and full-text search via the Firebase and Algolia APIs. |
| 19 | [`mcp-historical-weather`](mcp-historical-weather/) | Model Context Protocol server that exposes historical daily weather data from the Open-Meteo Archive (no API key required). |
| 20 | [`mcp-http-fetch`](mcp-http-fetch/) | An MCP server that performs HTTP requests (GET/POST) to any URL and fetches JSON — no API key required. |
| 21 | [`mcp-ip-geo`](mcp-ip-geo/) | Model Context Protocol server for IP geolocation, powered by the free ipapi.co API. |
| 22 | [`mcp-iss-tracker`](mcp-iss-tracker/) | MCP server for tracking the International Space Station: live position and the people currently in space. Wraps the free wheretheiss.at and Open Notify APIs (no API key required). |
| 23 | [`mcp-marine-weather`](mcp-marine-weather/) | Model Context Protocol (MCP) server exposing marine weather (wave height, period, direction, swell, sea surface temperature) from the free Open-Meteo Marine API. |
| 24 | [`mcp-nasa`](mcp-nasa/) | Model Context Protocol server wrapping NASA's open APIs (APOD and NeoWs near-earth objects). Works out of the box with NASA's DEMO_KEY, no signup required. |
| 25 | [`mcp-npm`](mcp-npm/) | Model Context Protocol server for the npm registry: inspect packages, search, and view download stats. |
| 26 | [`mcp-numbers-facts`](mcp-numbers-facts/) | Model Context Protocol (MCP) server exposing number, math, and date trivia facts (Numbers API style) over stdio. |
| 27 | [`mcp-open-food-facts`](mcp-open-food-facts/) | Model Context Protocol server for Open Food Facts — look up food products by barcode and search the global food database, no API key required. |
| 28 | [`mcp-open-library`](mcp-open-library/) | Model Context Protocol server for the Open Library API — search books, look up editions by ISBN, and list an author's works. No API key required. |
| 29 | [`mcp-openfda`](mcp-openfda/) | Model Context Protocol server for the openFDA API: search drug labels, query adverse-event reports, and look up drug recalls. |
| 30 | [`mcp-pokeapi`](mcp-pokeapi/) | Model Context Protocol server for PokeAPI — look up Pokemon, types, and browse the Pokedex. |
| 31 | [`mcp-public-apis`](mcp-public-apis/) | MCP server for the Public APIs Directory — search 1500+ free public APIs and browse categories, no API key required. |
| 32 | [`mcp-public-holidays`](mcp-public-holidays/) | Model Context Protocol server exposing public-holiday data for 100+ countries via the free Nager.Date API (no API key required). |
| 33 | [`mcp-pypi`](mcp-pypi/) | MCP server wrapping the PyPI JSON API: look up Python package metadata and release history. |
| 34 | [`mcp-quotes`](mcp-quotes/) | Model Context Protocol server for inspirational quotes. Exposes random_quote, search_quotes, and quotes_by_author tools backed by a live, key-free quotes API. |
| 35 | [`mcp-rss`](mcp-rss/) | MCP server that fetches and parses any RSS or Atom feed URL (no API key required). |
| 36 | [`mcp-sec-edgar`](mcp-sec-edgar/) | Model Context Protocol server for SEC EDGAR: look up companies, list recent filings, and fetch XBRL company facts. |
| 37 | [`mcp-sitemap`](mcp-sitemap/) | MCP server that fetches and parses sitemap.xml URLs (no API key required) |
| 38 | [`mcp-spacex`](mcp-spacex/) | Model Context Protocol server for the SpaceX API (launches, rockets) — no API key required. |
| 39 | [`mcp-stackexchange`](mcp-stackexchange/) | Model Context Protocol server for the Stack Exchange API (Stack Overflow). Search questions and fetch answers from the command line or any MCP client. |
| 40 | [`mcp-trivia`](mcp-trivia/) | MCP server wrapping the Open Trivia DB (opentdb.com) — fetch trivia questions and list categories. |
| 41 | [`mcp-url-metadata`](mcp-url-metadata/) | MCP server that fetches any URL and extracts its title, meta description, and OpenGraph tags. No API key required. |
| 42 | [`mcp-wayback`](mcp-wayback/) | Model Context Protocol server for the Internet Archive Wayback Machine. Find and list archived snapshots of any URL. |
| 43 | [`mcp-whois-rdap`](mcp-whois-rdap/) | MCP server for domain RDAP/WHOIS lookups via rdap.org (no API key required) |
| 44 | [`mcp-wikipedia`](mcp-wikipedia/) | Model Context Protocol server for Wikipedia: search articles, fetch summaries, and read full article text via the public Wikipedia REST/Action APIs. No API key required. |
| 45 | [`mcp-worldbank`](mcp-worldbank/) | Model Context Protocol server for the World Bank Indicators API — query development indicators, search the indicator catalog, and list countries. No API key required. |
| 46 | [`mcp-worldtime`](mcp-worldtime/) | Model Context Protocol server for world time and timezone lookups (worldtimeapi.org, no API key). |
| 47 | [`mcp-zip-postal`](mcp-zip-postal/) | MCP server for postal/ZIP code lookups worldwide via the free Zippopotam.us API — no API key required. |

**47 servers and counting** (target: 100). Run any: `cd <server> && npm install && npm run build && node smoke-test.mjs`.

## License
MIT.
