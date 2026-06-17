/**
 * Live smoke test for mcp-trivia.
 *
 * Spawns the built server over stdio, performs a real MCP handshake, lists the
 * tools, and makes ONE real tool call (list_categories) that hits the live
 * Open Trivia DB API. Asserts the result is non-empty and prints PASS.
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
    { name: "mcp-trivia-smoke", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.error("Handshake OK");

  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  console.error("Tools:", toolNames.join(", "));
  assert(toolNames.includes("get_questions"), "get_questions tool present");
  assert(toolNames.includes("list_categories"), "list_categories tool present");

  // ONE real call hitting the live API.
  const result = await client.callTool({
    name: "list_categories",
    arguments: {},
  });

  assert(!result.isError, "list_categories did not return an error");
  assert(Array.isArray(result.content), "content is an array");
  const text = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  assert(text.length > 0, "returned non-empty text");
  assert(/General Knowledge/.test(text), "real category data present");

  console.error("--- real returned data (first 300 chars) ---");
  console.error(text.slice(0, 300));
  console.error("--------------------------------------------");

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
