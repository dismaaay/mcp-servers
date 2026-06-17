/**
 * Smoke test: spins up the built server over stdio using a real MCP Client,
 * lists tools, and makes ONE real tool call against the live Free Dictionary
 * API. Asserts non-empty real data, then prints PASS.
 *
 * Run:  node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERT FAILED:", msg);
    process.exit(1);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath, // node
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("[smoke] connected over stdio");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("define"), "expected a 'define' tool");
  assert(names.includes("synonyms"), "expected a 'synonyms' tool");

  // 2) One REAL tool call against the live API
  const word = "serendipity";
  const res = await client.callTool({ name: "define", arguments: { word } });
  assert(!res.isError, `define returned an error: ${JSON.stringify(res.content)}`);
  const text = res.content?.[0]?.text ?? "";
  console.error(`[smoke] define("${word}") returned ${text.length} chars`);
  assert(text.length > 0, "define returned empty text");
  assert(
    text.toLowerCase().includes("serendipity"),
    "define output did not contain the headword"
  );
  console.error("[smoke] --- sample of real returned data ---");
  console.error(text.split("\n").slice(0, 8).join("\n"));
  console.error("[smoke] -------------------------------------");

  // 3) Bonus: exercise the synonyms tool too
  const synRes = await client.callTool({
    name: "synonyms",
    arguments: { word: "happy" },
  });
  assert(!synRes.isError, "synonyms returned an error");
  const synText = synRes.content?.[0]?.text ?? "";
  console.error(`[smoke] synonyms("happy"): ${synText.split("\n")[2] ?? synText}`);
  assert(synText.length > 0, "synonyms returned empty text");

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
