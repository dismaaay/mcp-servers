#!/usr/bin/env node
/**
 * Live smoke test for the Wayback Machine MCP server.
 *
 * It spins up the built server over stdio, performs the MCP handshake,
 * lists the advertised tools, then makes ONE real tool call that hits the
 * live Internet Archive API and asserts the result contains real data.
 *
 * Exit code 0 + "PASS" on success; non-zero on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
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
  console.log("Handshake OK: connected to mcp-wayback");

  // 1) List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("Tools advertised:", names.join(", "));
  assert(names.includes("get_snapshot"), "get_snapshot tool present");
  assert(names.includes("list_snapshots"), "list_snapshots tool present");

  // 2) ONE real call hitting the live Wayback API.
  console.log("Calling get_snapshot(example.com, 2010) against live API...");
  const res = await client.callTool({
    name: "get_snapshot",
    arguments: { url: "example.com", timestamp: "20100101" },
  });

  assert(!res.isError, `tool returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");

  const text = res.content.map((c) => c.text).join("\n");
  console.log("--- Real returned data ---");
  console.log(text);
  console.log("--------------------------");

  assert(text.length > 0, "returned text is non-empty");
  assert(
    text.includes("web.archive.org"),
    "returned data contains a real archived web.archive.org URL",
  );
  assert(
    /timestamp 20\d{12}/.test(text),
    "returned data contains a real 14-digit capture timestamp",
  );

  await client.close();
  console.log("PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
