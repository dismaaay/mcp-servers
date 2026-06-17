# mcp-sitemap

An [MCP](https://modelcontextprotocol.io) server that fetches and parses
`sitemap.xml` URLs and returns the list of pages they contain. **No API key
required.**

It understands both kinds of sitemap document defined by the
[Sitemaps protocol](https://www.sitemaps.org/protocol.html):

- a standard sitemap (`<urlset>`) listing page URLs, and
- a sitemap index (`<sitemapindex>`) listing other sitemaps.

For each entry it returns the `<loc>` plus any `<lastmod>`, `<changefreq>` and
`<priority>` metadata.

## Tools

### `get_urls`

Fetch and parse a sitemap.

| Parameter     | Type   | Required | Description                                              |
| ------------- | ------ | -------- | -------------------------------------------------------- |
| `sitemap_url` | string | yes      | Full URL to a sitemap.xml document (http or https).      |
| `limit`       | number | no       | Max URLs to return. Default `100`, min `1`, max `50000`. |

**Returns** a human-readable summary plus a JSON block of the shape:

```json
{
  "sitemapUrl": "https://www.sitemaps.org/sitemap.xml",
  "kind": "urlset",
  "totalFound": 84,
  "urls": [
    { "loc": "https://www.sitemaps.org/", "lastmod": "2016-11-21" }
  ]
}
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test

Runs a real MCP handshake over stdio, lists tools, and makes one live call
against a public sitemap:

```bash
npm run smoke
# -> ... PASS
```

## Use with Claude Desktop

Add this to your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sitemap": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-sitemap/dist/index.js"]
    }
  }
}
```

Then restart Claude Desktop and ask, for example:

> Get the first 10 URLs from https://www.sitemaps.org/sitemap.xml

## Development

```bash
npm run dev    # run from TypeScript source via tsx
```

## How it works

Core logic lives in [`src/api.ts`](src/api.ts) and has **no MCP dependencies**,
so it is easy to test in isolation. It uses Node's global `fetch` with a 10s
timeout, follows redirects, and parses the XML with namespace-tolerant regex
extraction (no external XML library). All diagnostic logging goes to **stderr**
so it never corrupts the stdio MCP protocol stream.

## License

MIT
