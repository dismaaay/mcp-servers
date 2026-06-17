/**
 * Live protocol smoke test for mcp-countries.
 *
 * Spawns the built server (dist/index.js) over stdio using the real MCP
 * Client, performs the protocol handshake, lists the tools, and makes ONE
 * real tool call that hits the live countries dataset. Asserts the result is
 * non-empty real data, then prints PASS.
 *
 * Run: npm run build && node smoke-test.mjs
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
    command: process.execPath, // node
    args: [serverPath],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  console.error("→ connecting + handshaking over stdio...");
  await client.connect(transport);
  console.error("✓ handshake complete");

  // 1. List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("✓ tools listed:", names.join(", "));
  assert(names.includes("get_country"), "get_country missing");
  assert(names.includes("list_by_region"), "list_by_region missing");
  assert(names.includes("get_borders"), "get_borders missing");

  // 2. ONE real tool call against the live dataset.
  console.error('→ calling get_country({ name: "Poland" })...');
  const res = await client.callTool({
    name: "get_country",
    arguments: { name: "Poland" },
  });
  assert(!res.isError, "get_country returned an error result");
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");
  const text = res.content.map((c) => c.text).join("\n");
  console.error("---- live tool output ----");
  console.error(text);
  console.error("--------------------------");

  // Assert it's real Poland data, not a stub.
  assert(/Poland/i.test(text), "expected 'Poland' in output");
  assert(/Warsaw/i.test(text), "expected capital 'Warsaw' in output");
  assert(/Europe/i.test(text), "expected region 'Europe' in output");

  // 3. Second real call: borders, to exercise cross-record resolution.
  console.error('→ calling get_borders({ name: "France" })...');
  const borders = await client.callTool({
    name: "get_borders",
    arguments: { name: "France" },
  });
  assert(!borders.isError, "get_borders returned an error");
  const btext = borders.content.map((c) => c.text).join("\n");
  console.error(btext);
  assert(/Germany/i.test(btext), "expected France to border Germany");

  await client.close();
  console.error("");
  console.error("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
