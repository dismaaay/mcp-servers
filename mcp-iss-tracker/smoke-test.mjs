#!/usr/bin/env node
/**
 * Live smoke test for mcp-iss-tracker.
 *
 * Spawns the built server over stdio, performs a real MCP handshake,
 * lists the tools, and makes ONE real tool call against the live API.
 * Asserts the result is non-empty and prints PASS on success.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
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
  console.error("Connected: MCP handshake OK");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.error(`Tools: ${names.join(", ")}`);

  if (!names.includes("iss_position")) fail("iss_position tool not listed");
  if (!names.includes("people_in_space"))
    fail("people_in_space tool not listed");

  // ONE real call against the live API.
  const res = await client.callTool({ name: "iss_position", arguments: {} });

  if (res.isError) fail(`iss_position returned an error: ${JSON.stringify(res.content)}`);
  if (!Array.isArray(res.content) || res.content.length === 0)
    fail("iss_position returned empty content");

  const text = res.content.map((c) => c.text).join("\n");
  if (!text || text.trim().length === 0) fail("iss_position returned empty text");

  // Parse the JSON payload (second content block) and sanity-check it.
  const json = JSON.parse(res.content[1].text);
  if (typeof json.latitude !== "number" || typeof json.longitude !== "number")
    fail("iss_position payload missing numeric coordinates");

  console.error("--- live data returned ---");
  console.error(res.content[0].text);
  console.error("--------------------------");

  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? err.stack || err.message : String(err));
}
