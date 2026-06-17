/**
 * Live smoke test for mcp-air-quality.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, performs the protocol handshake, lists tools, and makes ONE real
 * tool call against the live Open-Meteo Air Quality API. Asserts that the
 * handshake succeeds, the tool is advertised, and the call returns non-empty
 * real data. Prints PASS on success, exits non-zero on failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
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
    { capabilities: {} }
  );

  console.log("Connecting to mcp-air-quality (handshake)...");
  await client.connect(transport);
  console.log("Handshake OK.");

  // 1) List tools
  const { tools } = await client.listTools();
  console.log(`Tools advertised: ${tools.map((t) => t.name).join(", ")}`);
  assert(tools.length > 0, "server advertised at least one tool");
  const tool = tools.find((t) => t.name === "get_air_quality");
  assert(tool, "get_air_quality tool is present");
  assert(
    tool.inputSchema && tool.inputSchema.properties,
    "get_air_quality declares an input schema"
  );
  assert(
    "latitude" in tool.inputSchema.properties &&
      "longitude" in tool.inputSchema.properties,
    "input schema has latitude and longitude"
  );

  // 2) One real tool call -> Berlin, Germany
  console.log("\nCalling get_air_quality(52.52, 13.41) [Berlin]...");
  const res = await client.callTool({
    name: "get_air_quality",
    arguments: { latitude: 52.52, longitude: 13.41 },
  });

  assert(!res.isError, `tool call did not error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content is non-empty");

  const textParts = res.content.filter((c) => c.type === "text");
  assert(textParts.length > 0, "at least one text content part");

  const fullText = textParts.map((c) => c.text).join("\n");
  assert(fullText.trim().length > 0, "returned text is non-empty");
  assert(/European AQI/.test(fullText), "output mentions European AQI");
  assert(/PM2\.5/.test(fullText), "output mentions PM2.5");

  // Verify there is a real structured payload with numeric values.
  const jsonStart = fullText.indexOf("{");
  assert(jsonStart >= 0, "structured JSON payload present");
  const parsed = JSON.parse(fullText.slice(jsonStart));
  assert(parsed.location, "structured payload has location");
  assert(
    typeof parsed.raw === "object" && parsed.raw !== null,
    "structured payload has raw current readings"
  );
  const hasReading = Object.values(parsed.raw).some(
    (v) => typeof v === "number"
  );
  assert(hasReading, "raw readings contain at least one numeric measurement");

  console.log("\n--- Sample of real returned data ---");
  console.log(textParts[0].text);
  console.log("------------------------------------");

  await client.close();
  console.log("\nPASS");
}

main().catch((err) => {
  console.error("\nFAIL:", err);
  process.exit(1);
});
