/**
 * Live smoke test for mcp-earthquakes.
 *
 * Spawns the built server over stdio using the official MCP client, lists the
 * tools, then makes ONE real tool call against the live USGS API and asserts
 * the response contains real data. Prints "PASS" on success, exits non-zero on
 * any failure.
 *
 * Run with:  node smoke-test.mjs   (after `npm run build`)
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

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [serverPath],
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  console.error("[smoke] connected over stdio");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("recent"), "expected 'recent' tool");
  assert(names.includes("by_region"), "expected 'by_region' tool");

  // 2) One real tool call against the live USGS API.
  const result = await client.callTool({
    name: "recent",
    arguments: { minMagnitude: 2.5, limit: 5 },
  });

  assert(!result.isError, `tool returned an error: ${JSON.stringify(result)}`);
  assert(Array.isArray(result.content) && result.content.length > 0, "empty content");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  console.error("[smoke] --- live tool output (recent, M2.5+, limit 5) ---");
  console.error(text);
  console.error("[smoke] -------------------------------------------------");

  assert(text.length > 0, "tool text was empty");
  assert(/M\d/.test(text), "output did not contain a magnitude like 'M3.1'");
  assert(/UTC/.test(text), "output did not contain a UTC timestamp");

  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  console.error("[smoke] FAIL:", err);
  try {
    await client.close();
  } catch {}
  process.exit(1);
}
