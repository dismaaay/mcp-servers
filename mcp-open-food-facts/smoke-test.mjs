/**
 * Live smoke test for mcp-open-food-facts.
 *
 * Spawns the built server (dist/index.js) over stdio, performs the MCP
 * handshake, lists tools, and makes ONE real tool call against the live
 * Open Food Facts API. Asserts the response is non-empty real data.
 *
 * Prints "PASS" and exits 0 on success; prints "FAIL" and exits 1 otherwise.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

  await client.connect(transport);
  console.error("Connected to server over stdio.");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools listed:", names.join(", "));
  assert(names.includes("get_product"), "get_product tool missing");
  assert(names.includes("search_products"), "search_products tool missing");

  // 2. Real call: get_product for Nutella (a stable, well-known barcode)
  const res = await client.callTool({
    name: "get_product",
    arguments: { barcode: "3017620422003" },
  });
  assert(!res.isError, `get_product returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");
  const text = res.content.map((c) => c.text ?? "").join("\n");
  assert(text.length > 0, "empty text content");
  assert(/nutella/i.test(text), `expected real product data, got:\n${text}`);
  assert(/3017620422003/.test(text), "barcode missing from response");

  console.error("\n--- Sample real data returned by get_product ---");
  console.error(text.split("\n").slice(0, 10).join("\n"));
  console.error("------------------------------------------------\n");

  // 3. Real call: search_products
  const sres = await client.callTool({
    name: "search_products",
    arguments: { query: "coca cola", limit: 3 },
  });
  assert(!sres.isError, `search_products returned an error: ${JSON.stringify(sres.content)}`);
  const stext = sres.content.map((c) => c.text ?? "").join("\n");
  assert(/barcode\s+\d+/i.test(stext), `expected search results, got:\n${stext}`);
  console.error("--- Sample real data returned by search_products ---");
  console.error(stext.split("\n").slice(0, 6).join("\n"));
  console.error("----------------------------------------------------\n");

  await client.close();
  console.log("PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
