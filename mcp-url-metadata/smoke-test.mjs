/**
 * Live smoke test for mcp-url-metadata.
 *
 * Spawns the built server over stdio using the real MCP client, performs the
 * protocol handshake, lists tools, then makes ONE real get_metadata call
 * against a live URL and asserts the returned data is non-empty and correct.
 *
 * Exits 0 and prints PASS on success; exits 1 on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist/index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
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

  console.log("→ Connecting + handshake...");
  await client.connect(transport);
  console.log("✓ Handshake complete");

  console.log("→ Listing tools...");
  const { tools } = await client.listTools();
  console.log(`✓ Tools: ${tools.map((t) => t.name).join(", ")}`);
  assert(tools.length >= 1, "expected at least one tool");
  const tool = tools.find((t) => t.name === "get_metadata");
  assert(tool, "expected a get_metadata tool");
  assert(
    tool.inputSchema && tool.inputSchema.properties && tool.inputSchema.properties.url,
    "get_metadata should accept a 'url' input",
  );

  const testUrl = "https://www.iana.org/help/example-domains";
  console.log(`→ Calling get_metadata("${testUrl}")...`);
  const result = await client.callTool({
    name: "get_metadata",
    arguments: { url: testUrl },
  });

  assert(!result.isError, `tool returned an error: ${JSON.stringify(result.content)}`);
  assert(Array.isArray(result.content) && result.content.length >= 1, "expected content");

  const textBlocks = result.content.filter((c) => c.type === "text").map((c) => c.text);
  assert(textBlocks.length >= 1, "expected at least one text block");

  // Find the JSON block and parse it.
  let parsed = null;
  for (const t of textBlocks) {
    const trimmed = t.trim();
    if (trimmed.startsWith("{")) {
      parsed = JSON.parse(trimmed);
      break;
    }
  }
  assert(parsed, "expected a JSON metadata block in the response");
  assert(parsed.status === 200, `expected HTTP 200, got ${parsed.status}`);
  assert(
    typeof parsed.title === "string" && parsed.title.length > 0,
    "expected a non-empty title",
  );

  console.log("\n--- Real returned data (summary) ---");
  console.log(textBlocks[0]);
  console.log("--- end ---\n");

  // Negative path: a bad scheme should produce a clean error, not a crash.
  console.log('→ Calling get_metadata("ftp://example.com") (expect error)...');
  const errResult = await client.callTool({
    name: "get_metadata",
    arguments: { url: "ftp://example.com" },
  });
  assert(errResult.isError, "expected an error for unsupported scheme");
  console.log(`✓ Error path handled: ${errResult.content[0].text}`);

  await client.close();

  console.log("\nPASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFAIL:", err);
  process.exit(1);
});
