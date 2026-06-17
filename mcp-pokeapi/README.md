# mcp-pokeapi

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that wraps the
free [PokeAPI](https://pokeapi.co) so any MCP-compatible client (Claude Desktop, IDEs,
agents, etc.) can look up Pokemon, damage types, and browse the Pokedex.

No API key required.

## Tools

| Tool | Arguments | What it does |
| --- | --- | --- |
| `get_pokemon` | `name` (string — name or Pokedex id) | Returns a Pokemon's types, height/weight, abilities, base stats, and sprite URL. |
| `get_type` | `type` (string — type name or id) | Returns a type's damage relations (strong/weak against, immunities) and how many Pokemon have it. |
| `list_pokemon` | `limit` (1–100, default 20), `offset` (default 0) | Browses the Pokedex with pagination as a numbered list. |

### Example output

`get_pokemon("pikachu")`:

```
Pikachu (#25)
Type: Electric
Height: 0.4 m   Weight: 6.0 kg   Base XP: 112
Abilities: Static, Lightning Rod (hidden)
Base stats (total 320):
  - Hp: 35
  - Attack: 55
  - Defense: 40
  - Special Attack: 50
  - Special Defense: 50
  - Speed: 90
Sprite: https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png
```

## Install & build

```bash
npm install
npm run build
```

## Smoke test (live)

Connects to the built server over stdio, lists the tools, and makes one real call
against the live PokeAPI:

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
    "pokeapi": {
      "command": "node",
      "args": ["/Users/samsung/mcp-catalog/mcp-pokeapi/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop, then ask things like *"What type is Charizard?"* or
*"List the first 10 Pokemon."*

## Architecture

- `src/api.ts` — pure PokeAPI client + text formatters. **No MCP imports**, so it is
  unit-testable in isolation. Includes a 10s timeout, 404 handling, and clear errors.
- `src/index.ts` — MCP server: registers the three tools with `zod`-validated inputs and
  speaks JSON-RPC over stdio. All logs go to **stderr** (stdout is the protocol channel).
- `smoke-test.mjs` — official MCP client driving the server end-to-end against the live API.

## Notes

- Heights/weights are converted from PokeAPI's decimetres/hectograms to metres/kilograms.
- Inputs are normalized (trimmed, lowercased) so `"Pikachu"`, `"pikachu"`, and `"25"` all work.
- `list_pokemon` clamps `limit` to 1–100 to stay friendly to the upstream API.

## License

MIT
