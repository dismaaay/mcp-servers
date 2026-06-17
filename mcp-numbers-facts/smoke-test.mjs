/**
 * Live smoke test for mcp-numbers-facts.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * protocol handshake, lists the tools, then makes ONE real tool call that hits
 * the network and asserts a non-empty, real fact comes back. Prints PASS on
 * success, exits non-zero on failure.
 *
 * Run with:  node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    console.error(`ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  console.error("[smoke] connecting + handshake...");
  await client.connect(transport);
  console.error("[smoke] connected.");

  // 1) List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error(`[smoke] tools: ${names.join(", ")}`);
  assert(names.includes("number_fact"), "number_fact tool missing");
  assert(names.includes("math_fact"), "math_fact tool missing");
  assert(names.includes("date_fact"), "date_fact tool missing");

  // 2) ONE real tool call hitting the network.
  console.error("[smoke] calling number_fact(42)...");
  const res = await client.callTool({
    name: "number_fact",
    arguments: { number: 42 },
  });

  assert(!res.isError, `tool returned an error: ${JSON.stringify(res)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");
  const textItem = res.content.find((c) => c.type === "text");
  assert(textItem && typeof textItem.text === "string", "no text content");
  const text = textItem.text.trim();
  assert(text.length > 0, "fact text is empty");
  assert(/42/.test(text), `fact text does not mention 42: "${text}"`);

  const source = res.structuredContent?.source;
  console.error(`[smoke] returned fact (source=${source}): "${text}"`);

  await client.close();

  console.error("");
  console.error(`REAL DATA RETURNED: ${text}`);
  console.error("PASS");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
