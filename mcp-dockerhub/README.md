# mcp-dockerhub

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes the
**Docker Hub public API**. Ask your AI assistant about any public Docker image — its
stars, pull count, description and available tags — with **no API key required**.

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

---

## Tools

### `get_image(repo)`
Fetch metadata for a Docker Hub repository.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | string | yes | `nginx` (official) or `namespace/name` such as `bitnami/redis` |

Returns repository name, description, star count, pull count, last-updated time,
official/private flags and the hub URL.

```json
{
  "repository": "library/nginx",
  "description": "Official build of Nginx.",
  "is_private": false,
  "is_official": true,
  "star_count": 21305,
  "pull_count": 13086276522,
  "last_updated": "2026-06-14T16:52:35.09558Z",
  "url": "https://hub.docker.com/r/library/nginx"
}
```

### `list_tags(repo, page_size?)`
List tags for a repository, ordered by most recently updated.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | string | yes | `nginx` or `namespace/name` |
| `page_size` | number | no | Number of tags (1–100, default 25) |

Each tag includes its compressed size, last-updated time, content digest and
available architectures.

```json
{
  "repository": "library/nginx",
  "total_count": 1203,
  "returned": 3,
  "tags": [
    { "name": "trixie-perl", "full_size": 75264672, "last_updated": "2026-06-11T07:50:36Z", "digest": "sha256:...", "architectures": ["amd64", "arm/v5", "arm/v7"] }
  ]
}
```

> Official images (e.g. `nginx`, `redis`, `python`) live under Docker Hub's
> `library` namespace. A bare name like `nginx` is automatically resolved to
> `library/nginx`.

---

## Install & build

```bash
npm install
npm run build
```

## Verify it works (live smoke test)

The smoke test spawns the server, performs the MCP handshake, lists the tools and
makes a real call against Docker Hub:

```bash
npm run smoke
# ... prints real nginx data, ends with: PASS
```

## Run

```bash
npm start          # node dist/index.js  (stdio transport)
# or during development:
npm run dev        # tsx src/index.ts
```

The server speaks JSON-RPC over **stdio**; all logs go to **stderr** only.

---

## Claude Desktop configuration

Add this to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dockerhub": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-dockerhub/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

> *"How many pulls does the official nginx image have, and what are its latest 5 tags?"*

---

## Project layout

```
mcp-dockerhub/
├── src/
│   ├── api.ts        # Core Docker Hub client (no MCP deps) — fetch + 10s timeout + clear errors
│   └── index.ts      # MCP server: registers get_image / list_tags over stdio
├── smoke-test.mjs    # Live protocol handshake + real tool call, asserts non-empty output
├── package.json
├── tsconfig.json
└── README.md
```

## API reference

Backed by the public Docker Hub v2 REST API (`https://hub.docker.com/v2`).
See the [Docker Hub API docs](https://docs.docker.com/docker-hub/api/latest/).
Public repositories require no authentication; anonymous requests are rate-limited.

## License

MIT
