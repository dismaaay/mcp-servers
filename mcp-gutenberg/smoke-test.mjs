/**
 * Live smoke test for mcp-gutenberg.
 *
 * Spawns the built server over stdio, performs a real MCP protocol handshake,
 * lists the registered tools, then makes ONE real tool call that hits the live
 * Gutendex API and asserts the returned data is non-empty and sane.
 *
 * Exits 0 and prints "PASS" on success; exits 1 on any failure.
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
    command: process.execPath, // node
    args: [serverPath],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "mcp-gutenberg-smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.error("[smoke] handshake OK");

  // 1) List tools and verify all three are present.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  for (const expected of ["get_book", "popular_books", "search_books"]) {
    assert(names.includes(expected), `tool "${expected}" should be registered`);
  }

  // 2) ONE real tool call hitting the live Gutendex API.
  const res = await client.callTool({
    name: "get_book",
    arguments: { id: 1342 }, // Pride and Prejudice
  });

  assert(!res.isError, `get_book returned an error result: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "result content must be non-empty");
  const text = res.content.map((c) => c.text || "").join("\n");
  assert(text.trim().length > 0, "result text must be non-empty");
  assert(/Pride and Prejudice/i.test(text), "result must contain real book title 'Pride and Prejudice'");
  assert(/Austen/i.test(text), "result must contain real author 'Austen'");

  console.error("[smoke] real get_book(1342) returned:");
  console.error(text.split("\n").slice(0, 6).map((l) => "    " + l).join("\n"));

  await client.close();

  // Print the asserted-on data to stdout so the harness can quote it.
  const snippet = text.split("\n").slice(0, 5).join(" | ");
  console.log("RETURNED_DATA: " + snippet);
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
