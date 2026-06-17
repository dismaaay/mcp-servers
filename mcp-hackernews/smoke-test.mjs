/**
 * Live smoke test for mcp-hackernews.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * handshake, lists the tools, and makes one real tool call that hits the live
 * Hacker News API. Asserts the result is non-empty, then prints PASS.
 *
 * Run:  node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverPath],
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.error("[smoke] connected to server over stdio");

  // 1. List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("get_top_stories"), "get_top_stories tool missing");
  assert(names.includes("get_story"), "get_story tool missing");
  assert(names.includes("search_stories"), "search_stories tool missing");

  // 2. Real tool call against the live API: top 3 stories.
  const top = await client.callTool({
    name: "get_top_stories",
    arguments: { limit: 3 },
  });
  assert(!top.isError, `get_top_stories returned an error: ${JSON.stringify(top.content)}`);
  assert(Array.isArray(top.content) && top.content.length > 0, "empty content");
  const topText = top.content[0].text;
  assert(typeof topText === "string" && topText.length > 50, "top stories text too short");
  assert(topText.includes("points"), "top stories text missing score metadata");
  console.error("[smoke] get_top_stories sample:\n" + topText.split("\n").slice(0, 6).join("\n"));

  // 3. Real search call.
  const search = await client.callTool({
    name: "search_stories",
    arguments: { query: "rust", limit: 2 },
  });
  assert(!search.isError, `search_stories returned an error: ${JSON.stringify(search.content)}`);
  const searchText = search.content[0].text;
  assert(typeof searchText === "string" && searchText.toLowerCase().includes("hacker news"), "search text malformed");
  console.error("[smoke] search_stories sample:\n" + searchText.split("\n").slice(0, 4).join("\n"));

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("[smoke] FAIL:", err);
  process.exit(1);
});
