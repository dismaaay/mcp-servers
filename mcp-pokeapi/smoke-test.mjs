/**
 * Live smoke test for mcp-pokeapi.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP client,
 * lists the tools, then makes ONE real tool call (get_pokemon "pikachu") that hits
 * the live PokeAPI. Asserts non-empty real data, then prints PASS.
 *
 * Run:  npm run build && node smoke-test.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERTION FAILED:", msg);
    process.exit(1);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // current node binary
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("Connected to mcp-pokeapi over stdio.");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools listed:", names.join(", "));
  assert(names.includes("get_pokemon"), "get_pokemon not registered");
  assert(names.includes("get_type"), "get_type not registered");
  assert(names.includes("list_pokemon"), "list_pokemon not registered");

  // 2. One real tool call against the live API
  const res = await client.callTool({
    name: "get_pokemon",
    arguments: { name: "pikachu" },
  });

  assert(!res.isError, "get_pokemon returned an error result: " + JSON.stringify(res.content));
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");
  const text = res.content[0].text ?? "";
  console.error("--- get_pokemon('pikachu') returned ---");
  console.error(text);
  console.error("---------------------------------------");

  assert(text.length > 0, "tool returned empty text");
  assert(/pikachu/i.test(text), "result does not mention Pikachu");
  assert(/electric/i.test(text), "result missing Electric type (live data check)");
  assert(/#25/.test(text), "result missing Pokedex #25 (live data check)");

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
