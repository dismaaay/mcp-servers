#!/usr/bin/env node
/**
 * Live smoke test for mcp-arxiv.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, lists the registered tools, and performs ONE real tool call against
 * the live arXiv API. Asserts the response is non-empty and looks like real
 * data, then prints "PASS".
 *
 * Run with: node smoke-test.mjs   (after `npm run build`)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverPath],
  });
  const client = new Client({ name: "mcp-arxiv-smoke-test", version: "1.0.0" });

  await client.connect(transport);
  console.error("Connected to mcp-arxiv over stdio.");

  // 1. List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools:", names.join(", "));
  assert(names.includes("search_papers"), "search_papers tool must be registered");
  assert(names.includes("get_paper"), "get_paper tool must be registered");

  // 2. One real call against the live API.
  const searchRes = await client.callTool({
    name: "search_papers",
    arguments: { query: "attention is all you need", max: 3 },
  });
  assert(!searchRes.isError, `search_papers returned an error: ${JSON.stringify(searchRes.content)}`);
  const searchText = (searchRes.content ?? []).map((c) => c.text ?? "").join("\n");
  assert(searchText.length > 50, "search result text should be non-trivial");
  assert(/arXiv:/i.test(searchText), "search result should contain arXiv ids");
  console.error("\n--- search_papers sample ---");
  console.error(searchText.slice(0, 600));

  // 3. A second real call: fetch a known paper's full detail.
  const getRes = await client.callTool({
    name: "get_paper",
    arguments: { arxiv_id: "1706.03762" },
  });
  assert(!getRes.isError, `get_paper returned an error: ${JSON.stringify(getRes.content)}`);
  const getText = (getRes.content ?? []).map((c) => c.text ?? "").join("\n");
  assert(/attention is all you need/i.test(getText), "get_paper should return the Transformer paper");
  assert(/Abstract/.test(getText), "get_paper should include the abstract section");
  console.error("\n--- get_paper sample ---");
  console.error(getText.slice(0, 600));

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
