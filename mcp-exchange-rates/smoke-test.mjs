/**
 * Live smoke test for the Exchange Rates MCP server.
 *
 * Spawns the built server (dist/index.js) over stdio, performs a real MCP
 * handshake, lists the tools, and makes ONE real tool call that hits the live
 * Frankfurter API. Asserts a non-empty, sensible result and prints PASS.
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
  command: process.execPath, // current node binary
  args: [serverPath],
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  console.error("Connected to server over stdio.");

  // 1. List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools listed:", names.join(", "));
  for (const expected of ["convert", "history", "latest"]) {
    if (!names.includes(expected)) fail(`expected tool "${expected}" not found`);
  }

  // 2. One real tool call against the live API.
  const res = await client.callTool({
    name: "convert",
    arguments: { amount: 100, from: "USD", to: "EUR" },
  });

  if (res.isError) fail(`convert returned an error result: ${JSON.stringify(res.content)}`);
  const out = res.content?.[0]?.text ?? "";
  console.error("convert(100, USD, EUR) ->\n" + out);

  if (!out || !out.includes("USD") || !out.includes("EUR") || !/=\s*[\d.]+/.test(out)) {
    fail(`convert result did not look like real data: ${JSON.stringify(out)}`);
  }

  // 3. A second call exercising a different tool/endpoint (latest).
  const latestRes = await client.callTool({
    name: "latest",
    arguments: { base: "GBP" },
  });
  if (latestRes.isError) fail(`latest returned an error: ${JSON.stringify(latestRes.content)}`);
  const latestOut = latestRes.content?.[0]?.text ?? "";
  console.error("\nlatest(GBP) -> first lines:\n" + latestOut.split("\n").slice(0, 4).join("\n"));
  if (!latestOut.includes("GBP") || !latestOut.includes("USD")) {
    fail(`latest result did not look like real data: ${JSON.stringify(latestOut.slice(0, 120))}`);
  }

  console.error("");
  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  fail(err?.stack || String(err));
}
