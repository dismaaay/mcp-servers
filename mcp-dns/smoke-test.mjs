/**
 * Live smoke test for mcp-dns.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * protocol handshake, lists tools, then makes REAL tool calls that hit
 * Cloudflare DoH and asserts on the returned data. Prints PASS on success
 * or throws (non-zero exit) on any failure.
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

  const client = new Client(
    { name: "mcp-dns-smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("[smoke] handshake OK — connected to server");

  // ---- list tools ----
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`[smoke] tools: ${names.join(", ")}`);
  assert(names.includes("resolve"), "resolve tool must be registered");
  assert(names.includes("reverse"), "reverse tool must be registered");

  // ---- real call #1: resolve A for cloudflare.com ----
  const r1 = await client.callTool({
    name: "resolve",
    arguments: { name: "cloudflare.com", type: "A" },
  });
  assert(!r1.isError, "resolve(cloudflare.com, A) must not error");
  const t1 = r1.content?.[0]?.text ?? "";
  assert(t1.length > 0, "resolve result must be non-empty");
  // Parse the embedded JSON block to verify a real IPv4 came back.
  const json1 = JSON.parse(t1.slice(t1.indexOf("{")));
  assert(Array.isArray(json1.answers), "resolve answers must be an array");
  assert(json1.answers.length > 0, "resolve must return >=1 A record");
  const ip = json1.answers[0].data;
  assert(
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip),
    `resolve must return a valid IPv4, got "${ip}"`,
  );
  console.log(`[smoke] resolve cloudflare.com A -> ${ip} (status ${json1.status})`);

  // ---- real call #2: reverse 1.1.1.1 ----
  const r2 = await client.callTool({
    name: "reverse",
    arguments: { ip: "1.1.1.1" },
  });
  assert(!r2.isError, "reverse(1.1.1.1) must not error");
  const t2 = r2.content?.[0]?.text ?? "";
  const json2 = JSON.parse(t2.slice(t2.indexOf("{")));
  assert(Array.isArray(json2.hostnames), "reverse hostnames must be an array");
  assert(json2.hostnames.length > 0, "reverse must return >=1 hostname");
  console.log(`[smoke] reverse 1.1.1.1 -> ${json2.hostnames.join(", ")}`);

  await client.close();

  console.log("\n==============================");
  console.log("  PASS — mcp-dns smoke test");
  console.log("==============================");
}

main().catch((err) => {
  console.error("\n[smoke] FAILED:", err.message ?? err);
  process.exit(1);
});
