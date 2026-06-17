/**
 * Live smoke test for mcp-quotes.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists the
 * tools, and makes ONE real tool call that hits the live quotes API. Asserts
 * the response is non-empty and prints "PASS" on success.
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
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.log("[smoke] connected over stdio");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("[smoke] tools listed:", names.join(", "));
  assert(names.includes("random_quote"), "random_quote tool present");
  assert(names.includes("search_quotes"), "search_quotes tool present");
  assert(names.includes("quotes_by_author"), "quotes_by_author tool present");

  // 2) One real tool call against the live API.
  const res = await client.callTool({
    name: "search_quotes",
    arguments: { query: "success" },
  });
  assert(!res.isError, `tool call returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "tool returned content");
  const text = res.content.map((c) => c.text).join("\n");
  assert(text && text.trim().length > 0, "tool returned non-empty text");
  assert(/Found \d+ quote/.test(text), "tool returned a formatted result header");
  assert(/\d+ quote\(s\)/.test(text) && !/Found 0 quote/.test(text), "search returned at least one real quote");

  console.log("[smoke] sample real data from live API:");
  console.log(
    text
      .split("\n")
      .slice(0, 6)
      .map((l) => "    " + l)
      .join("\n"),
  );

  // 3) A second real call to exercise the live /random endpoint.
  const rnd = await client.callTool({ name: "random_quote", arguments: {} });
  assert(!rnd.isError, "random_quote returned an error");
  const rtext = rnd.content.map((c) => c.text).join("\n");
  assert(rtext.includes('"') && rtext.includes("-"), "random_quote returned a formatted quote");
  console.log("[smoke] random_quote sample:", rtext.replace(/\n/g, " "));

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
