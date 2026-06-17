/**
 * Live smoke test for the Data USA MCP server.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a full protocol
 * handshake, lists tools, then makes ONE real tool call that hits the live
 * Data USA API and asserts the result is non-empty. Prints PASS on success.
 *
 * Run with:  node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist", "index.js");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: "inherit",
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} }
);

try {
  // 1) Handshake
  await client.connect(transport);
  console.error("handshake: OK");

  // 2) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("tools:", names.join(", "));
  if (!names.includes("get_population") || !names.includes("query")) {
    fail(`expected tools get_population and query, got: ${names.join(", ")}`);
  }

  // 3) ONE real tool call against the live API
  const res = await client.callTool({
    name: "get_population",
    arguments: { geo: "Nation" },
  });

  if (res.isError) {
    fail(`get_population returned an error: ${JSON.stringify(res.content)}`);
  }

  const textBlocks = (res.content ?? []).filter((c) => c.type === "text");
  if (textBlocks.length === 0 || !textBlocks[0].text?.trim()) {
    fail("tool returned empty text content");
  }

  const sc = res.structuredContent;
  if (!sc || !Array.isArray(sc.records) || sc.records.length === 0) {
    fail("tool returned no structured records");
  }

  const us = sc.records[0];
  if (!Number.isFinite(us.population) || us.population <= 0) {
    fail(`invalid population value: ${JSON.stringify(us)}`);
  }

  console.error("---- real tool output ----");
  console.error(textBlocks[0].text);
  console.error("--------------------------");

  console.error(
    `assertion: ${us.name} population (${sc.year}) = ${us.population.toLocaleString(
      "en-US"
    )} > 0  OK`
  );

  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  fail(err?.stack || String(err));
}
