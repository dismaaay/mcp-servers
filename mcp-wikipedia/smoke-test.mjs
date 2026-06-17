/**
 * Live smoke test for mcp-wikipedia.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, lists the tools, and makes REAL tool calls against the live
 * Wikipedia API. Asserts the responses are non-empty and contain expected
 * real data. Prints "PASS" on success, exits non-zero on any failure.
 *
 * Run with:  node smoke-test.mjs   (after `npm run build`)
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

function textOf(result) {
  return (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("[smoke] connected to mcp-wikipedia over stdio");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("search"), "search tool missing");
  assert(names.includes("get_summary"), "get_summary tool missing");
  assert(names.includes("get_page_extract"), "get_page_extract tool missing");

  // 2. Real call: search
  const searchRes = await client.callTool({
    name: "search",
    arguments: { query: "Alan Turing", limit: 3 },
  });
  const searchText = textOf(searchRes);
  console.error("[smoke] search() returned:\n" + searchText.slice(0, 300));
  assert(!searchRes.isError, "search returned an error");
  assert(searchText.length > 30, "search returned empty/short text");
  assert(/Turing/i.test(searchText), "search text did not mention Turing");

  // 3. Real call: get_summary
  const summaryRes = await client.callTool({
    name: "get_summary",
    arguments: { title: "Alan Turing" },
  });
  const summaryText = textOf(summaryRes);
  console.error(
    "[smoke] get_summary() returned:\n" + summaryText.slice(0, 300)
  );
  assert(!summaryRes.isError, "get_summary returned an error");
  assert(
    /computer scientist|mathematician/i.test(summaryText),
    "summary did not contain expected biographical text"
  );

  // 4. Real call: get_page_extract
  const extractRes = await client.callTool({
    name: "get_page_extract",
    arguments: { title: "Alan Turing" },
  });
  const extractText = textOf(extractRes);
  console.error(
    "[smoke] get_page_extract() returned (head):\n" + extractText.slice(0, 200)
  );
  assert(!extractRes.isError, "get_page_extract returned an error");
  assert(
    extractText.length > 500,
    "extract too short to be a real article body"
  );

  // 5. Error handling: a nonsense title should not crash, should report not found
  const missingRes = await client.callTool({
    name: "get_summary",
    arguments: { title: "ZzqxNotARealArticleXyz123456" },
  });
  const missingText = textOf(missingRes);
  console.error("[smoke] not-found handling:", missingText.slice(0, 120));
  assert(missingRes.isError === true, "missing page should be flagged isError");

  await client.close();
  console.error("[smoke] all assertions passed");
  console.log("PASS");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
