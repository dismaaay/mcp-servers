#!/usr/bin/env node
/**
 * Live smoke test for the Public APIs Directory MCP server.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * handshake, lists tools, then calls each tool with real arguments and asserts
 * the responses contain real data. Prints PASS on success, FAIL + exits 1 on
 * any problem.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function textOf(result) {
  return (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  console.log("→ connecting + handshake...");
  await client.connect(transport);
  console.log("✓ handshake complete");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`✓ listTools -> [${names.join(", ")}]`);
  assert(names.includes("search_apis"), "search_apis tool registered");
  assert(names.includes("list_categories"), "list_categories tool registered");

  // 2. Real call: list_categories
  const catRes = await client.callTool({
    name: "list_categories",
    arguments: {},
  });
  const catText = textOf(catRes);
  assert(!catRes.isError, "list_categories did not error");
  assert(catText.length > 0, "list_categories returned non-empty text");
  assert(/\(\d+\)/.test(catText), "list_categories includes per-category counts");
  console.log("✓ list_categories returned real data:");
  console.log(
    "    " + catText.split("\n").slice(0, 4).join("\n    "),
  );

  // 3. Real call: search_apis (the required one real call returning real data)
  const searchRes = await client.callTool({
    name: "search_apis",
    arguments: { query: "weather", limit: 3 },
  });
  const searchText = textOf(searchRes);
  assert(!searchRes.isError, "search_apis did not error");
  assert(searchText.length > 0, "search_apis returned non-empty text");
  assert(
    /Found \d+ API/.test(searchText),
    "search_apis returned a real result count",
  );
  assert(
    /Link: https?:\/\//.test(searchText),
    "search_apis results include real API links",
  );
  console.log('✓ search_apis("weather") returned real data:');
  console.log("    " + searchText.split("\n").slice(0, 6).join("\n    "));

  // 4. Real call: category-filtered search
  const filtered = await client.callTool({
    name: "search_apis",
    arguments: { query: "cat", category: "Animals", limit: 2 },
  });
  const filteredText = textOf(filtered);
  assert(!filtered.isError, "category-filtered search did not error");
  assert(
    /Category: Animals/.test(filteredText),
    "category filter restricts results to Animals",
  );
  console.log('✓ search_apis("cat", category="Animals") respected the filter');

  await client.close();
  console.log("\nPASS");
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});
