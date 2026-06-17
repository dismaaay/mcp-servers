/**
 * Live smoke test for mcp-open-library.
 *
 * Spawns the built server over stdio using the official MCP client, lists the
 * tools, and makes ONE real tool call against the live Open Library API.
 * Asserts the result is non-empty, then prints PASS.
 *
 * Run: node smoke-test.mjs   (after `npm run build`)
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

const transport = new StdioClientTransport({
  command: process.execPath, // node
  args: [serverPath],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.error("Connected to mcp-open-library over stdio.");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools listed:", names.join(", "));
  assert(names.includes("search_books"), "search_books tool missing");
  assert(names.includes("get_book"), "get_book tool missing");
  assert(names.includes("author_works"), "author_works tool missing");

  // 2) Real tool call against the live API
  const res = await client.callTool({
    name: "search_books",
    arguments: { query: "the hobbit", limit: 3 },
  });
  assert(!res.isError, "search_books returned an error result");
  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  assert(text && text.trim().length > 0, "search_books returned empty text");
  assert(/hobbit/i.test(text), "search_books result did not mention 'hobbit'");
  console.error("--- search_books('the hobbit', 3) returned: ---");
  console.error(text);

  // 3) Second real call: get_book by a known ISBN (The Hobbit)
  const res2 = await client.callTool({
    name: "get_book",
    arguments: { isbn: "9780261103344" },
  });
  assert(!res2.isError, "get_book returned an error result");
  const text2 = (res2.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  assert(/title/i.test(text2), "get_book result missing a Title field");
  console.error("--- get_book('9780261103344') returned: ---");
  console.error(text2);

  console.error("\nPASS");
  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  console.error("SMOKE TEST FAILED:", err);
  try {
    await client.close();
  } catch {}
  process.exit(1);
}
