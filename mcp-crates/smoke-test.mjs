#!/usr/bin/env node
/**
 * Live smoke test for the mcp-crates MCP server.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * protocol handshake, lists the tools, and makes ONE real tool call that
 * hits the live crates.io API. Asserts the response is non-empty and prints
 * PASS on success. Exits non-zero on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client(
    { name: "mcp-crates-smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("Handshake OK — connected to mcp-crates server.");

  // 1. List tools.
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  console.log("Tools:", toolNames.join(", "));
  assert(toolNames.includes("get_crate"), "get_crate tool is registered");
  assert(
    toolNames.includes("search_crates"),
    "search_crates tool is registered"
  );

  // 2. One real call against the live crates.io API.
  console.log('\nCalling get_crate({ name: "serde" })...');
  const res = await client.callTool({
    name: "get_crate",
    arguments: { name: "serde" },
  });

  assert(!res.isError, "get_crate did not return an error");
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");
  const text = res.content.map((c) => c.text ?? "").join("\n");
  assert(text.length > 0, "returned text non-empty");
  assert(/serde/i.test(text), 'response mentions "serde"');
  assert(/downloads/i.test(text), "response includes download stats");

  console.log("\n--- Sample of real returned data ---");
  console.log(text.split("\n").slice(0, 12).join("\n"));
  console.log("------------------------------------");

  // 3. Exercise the second tool too, for good measure.
  console.log('\nCalling search_crates({ query: "http client", limit: 3 })...');
  const searchRes = await client.callTool({
    name: "search_crates",
    arguments: { query: "http client", limit: 3 },
  });
  assert(!searchRes.isError, "search_crates did not return an error");
  const searchText = searchRes.content.map((c) => c.text ?? "").join("\n");
  assert(searchText.length > 0, "search returned non-empty text");
  console.log(searchText.split("\n").slice(0, 6).join("\n"));

  await client.close();
  console.log("\nPASS");
}

main().catch((err) => {
  console.error("\nFAIL:", err);
  process.exit(1);
});
