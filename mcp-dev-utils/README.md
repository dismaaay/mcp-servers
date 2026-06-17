# mcp-dev-utils

A small, fast **Model Context Protocol (MCP)** server that gives any MCP client
(Claude Desktop, Claude Code, etc.) a set of everyday developer utilities —
**no network, no API keys, fully local**.

| Tool | What it does |
|------|--------------|
| `uuid` | Generate a UUID — `v4` (random) or `v7` (time-ordered, RFC 9562) |
| `hash` | Hash text and return the hex digest (`md5`, `sha1`, `sha256`, `sha512`) |
| `base64` | Base64 `encode` / `decode` UTF-8 text |
| `jwt_decode` | Decode (not verify) a JWT into header + payload + claims |
| `unix_to_iso` | Convert a Unix timestamp (s or ms, auto-detected) to ISO 8601 UTC |
| `iso_to_unix` | Convert an ISO 8601 date string to Unix seconds + milliseconds |

Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
TypeScript SDK and [Zod](https://zod.dev) for input validation. All logic is
pure and lives in `src/api.ts` (no MCP imports), so it is trivially unit-testable
and reusable. Diagnostics go to **stderr only** — stdout carries the JSON-RPC stream.

---

## Install & build

```bash
npm install      # installs deps and builds (via the prepare script)
npm run build    # or build explicitly -> dist/
```

## Verify it works (live MCP handshake)

```bash
npm run smoke    # or: node smoke-test.mjs
```

This spawns the built server, performs a real protocol handshake, lists the
tools, and calls every tool with real inputs, asserting correct output. You
should see:

```
[1/4] Handshake OK — connected to mcp-dev-utils
[2/4] listTools -> base64, hash, iso_to_unix, jwt_decode, unix_to_iso, uuid
[3/4] callTool hash("hello", sha256) -> { "algo": "sha256", "hex": "2cf2...9824", "length": 64 }
[4/4] All 6 tools returned correct real data
PASS
```

---

## Use with Claude Desktop

Add the server to your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-utils": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-dev-utils/dist/index.js"]
    }
  }
}
```

> Use the absolute path to `dist/index.js`. Run `npm run build` first so the file
> exists. Restart Claude Desktop after editing the config.

### Use with Claude Code

```bash
claude mcp add dev-utils -- node /Users/samsung/mcp-catalog/mcp-dev-utils/dist/index.js
```

---

## Tool reference

### `uuid`
- **Input:** `version?` — `"v4"` (default) or `"v7"`
- **Output (text):** the UUID string
- Example: `uuid({ version: "v7" })` -> `0190b3c1-...-7...-a...`

### `hash`
- **Input:** `text` (string), `algo?` — `md5 | sha1 | sha256 | sha512` (default `sha256`)
- **Output (JSON):** `{ "algo": "...", "hex": "...", "length": N }`
- Example: `hash({ text: "hello" })` -> `{"algo":"sha256","hex":"2cf24dba...9824","length":64}`

### `base64`
- **Input:** `text` (string), `mode?` — `encode` (default) or `decode`
- **Output (JSON):** `{ "mode": "...", "result": "..." }`
- Invalid base64 on decode raises a clear error.

### `jwt_decode`
- **Input:** `token` (string)
- **Output (JSON):** `{ header, payload, signature, claims }` where `claims`
  surfaces `issuedAt`, `expiresAt`, `notBefore`, and `isExpired` when present.
- **No signature verification is performed** — this is a decode utility only.

### `unix_to_iso`
- **Input:** `ts` (number). Values `>= 1e12` are treated as **milliseconds**, else **seconds**.
- **Output (JSON):** `{ input, unit, iso, utc }`
- Example: `unix_to_iso({ ts: 1516239022 })` -> `iso: "2018-01-18T01:30:22.000Z"`

### `iso_to_unix`
- **Input:** `iso` (string) — any Date-parseable string
- **Output (JSON):** `{ input, iso, seconds, milliseconds }`
- Example: `iso_to_unix({ iso: "2018-01-18T01:30:22Z" })` -> `seconds: 1516239022`

---

## Project layout

```
mcp-dev-utils/
├── src/
│   ├── api.ts        # pure logic, no MCP imports
│   └── index.ts      # MCP server: registers tools, stdio transport
├── smoke-test.mjs    # live protocol handshake + real tool calls
├── dist/             # compiled output (npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
