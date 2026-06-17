/**
 * Live smoke test for mcp-ip-geo.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * handshake, lists the tools, and makes ONE real tool call against the live
 * ipapi.co API. Asserts the result is non-empty and prints PASS on success.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("[smoke] connected over stdio");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools listed:", names.join(", "));
  assert(names.includes("lookup_ip"), "lookup_ip tool must be exposed");
  assert(names.includes("my_location"), "my_location tool must be exposed");

  // 2. Make ONE real tool call against the live API
  const result = await client.callTool({
    name: "lookup_ip",
    arguments: { ip: "1.1.1.1" },
  });

  assert(!result.isError, `tool returned an error: ${JSON.stringify(result.content)}`);
  assert(Array.isArray(result.content) && result.content.length > 0, "content must be non-empty");
  const text = result.content[0]?.text ?? "";
  assert(typeof text === "string" && text.length > 0, "text content must be non-empty");
  assert(/1\.1\.1\.1/.test(text), "result should reference the queried IP 1.1.1.1");
  assert(/Australia|Sydney|Cloudflare/i.test(text), "result should contain real geo data for 1.1.1.1");

  console.error("[smoke] real API response for lookup_ip(1.1.1.1):");
  console.error("--------------------------------------------------");
  console.error(text);
  console.error("--------------------------------------------------");

  await client.close();

  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
