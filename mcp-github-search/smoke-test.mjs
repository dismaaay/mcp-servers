/**
 * Live smoke test for mcp-github-search.
 *
 * Spawns the built server over stdio, performs a real MCP handshake,
 * lists the tools, then makes ONE real tool call against the live GitHub
 * API and asserts the response contains real data. Prints PASS on success.
 *
 * Run: node smoke-test.mjs
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
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  console.error("Connecting to server...");
  await client.connect(transport);
  console.error("Handshake OK.");

  // List tools and verify all three are registered.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools:", names.join(", "));
  assert(names.includes("search_repos"), "search_repos missing");
  assert(names.includes("search_code"), "search_code missing");
  assert(names.includes("search_users"), "search_users missing");

  // ONE real call against the live GitHub API.
  console.error('Calling search_repos("model context protocol", sort=stars)...');
  const result = await client.callTool({
    name: "search_repos",
    arguments: { query: "model context protocol", sort: "stars" },
  });

  assert(!result.isError, `tool returned an error: ${JSON.stringify(result.content)}`);
  assert(Array.isArray(result.content) && result.content.length > 0, "empty content");
  const text = result.content[0].text;
  assert(typeof text === "string" && text.length > 0, "empty text");
  assert(/Found [\d,]+ repositories/.test(text), "no result count in output");
  assert(/https:\/\/github\.com\//.test(text), "no github URL in output");

  console.error("\n----- SAMPLE RETURNED DATA -----");
  console.error(text.slice(0, 600));
  console.error("--------------------------------\n");

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
