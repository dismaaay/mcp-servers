/**
 * Live smoke test for mcp-marine-weather.
 *
 * Spawns the built server over stdio, performs a real MCP handshake,
 * lists tools, then makes ONE real call to get_marine for a known ocean
 * point (North Sea, off Germany) and asserts that real data comes back.
 *
 * Exits 0 and prints PASS on success; exits 1 on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  console.error("Handshake OK");

  const { tools } = await client.listTools();
  console.error("Tools:", tools.map((t) => t.name).join(", "));
  if (!tools.some((t) => t.name === "get_marine")) {
    fail("get_marine tool not found in tools/list");
  }

  // North Sea off the German coast — a real over-water point.
  const result = await client.callTool({
    name: "get_marine",
    arguments: { latitude: 54.544, longitude: 6.0 },
  });

  if (result.isError) {
    fail("get_marine returned isError: " + JSON.stringify(result.content));
  }

  const text = (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  if (!text || text.trim().length === 0) {
    fail("get_marine returned empty content");
  }

  // Assert the JSON payload parses and contains real metric values.
  const jsonBlock = (result.content ?? []).find(
    (c) => c.type === "text" && c.text.trim().startsWith("{")
  );
  if (!jsonBlock) fail("no JSON snapshot block returned");

  const snapshot = JSON.parse(jsonBlock.text);
  if (!Array.isArray(snapshot.metrics) || snapshot.metrics.length === 0) {
    fail("snapshot.metrics was empty");
  }
  const wave = snapshot.metrics.find((m) => m.key === "wave_height");
  if (!wave || typeof wave.value !== "number") {
    fail("wave_height was not a real number: " + JSON.stringify(wave));
  }

  console.error("---- returned text ----");
  console.error(text);
  console.error("-----------------------");
  console.error(
    `Real data: wave_height=${wave.value}${wave.unit} at time=${snapshot.time}`
  );

  await client.close();
  console.log("PASS");
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? err.stack || err.message : String(err));
}
