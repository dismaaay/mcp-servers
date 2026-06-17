#!/usr/bin/env node
/**
 * Live smoke test for mcp-coinbase-spot.
 *
 * Spawns the built server over stdio, performs a real MCP handshake, lists the
 * tools, then makes ONE real API call (spot_price BTC-USD) and asserts the
 * result is non-empty and contains real data. Prints PASS on success.
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
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: "inherit",
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  console.error("[smoke] handshake OK");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error(`[smoke] tools: ${names.join(", ")}`);
  assert(names.includes("spot_price"), "spot_price tool registered");
  assert(names.includes("exchange_rates"), "exchange_rates tool registered");

  const result = await client.callTool({
    name: "spot_price",
    arguments: { pair: "BTC-USD" },
  });

  assert(!result.isError, "spot_price call did not error");
  assert(Array.isArray(result.content), "result has content array");
  assert(result.content.length > 0, "result content is non-empty");

  const jsonBlock = result.content.find(
    (c) => c.type === "text" && c.text.trim().startsWith("{"),
  );
  assert(jsonBlock, "result includes a JSON block");

  const data = JSON.parse(jsonBlock.text);
  assert(data.base === "BTC", "base is BTC");
  assert(data.currency === "USD", "currency is USD");
  assert(
    typeof data.amount === "string" && Number(data.amount) > 0,
    "amount is a positive number string",
  );

  console.error("");
  console.error(`[smoke] REAL DATA: BTC-USD spot = ${data.amount} USD`);
  console.error(`[smoke] human text: ${result.content[0].text}`);
  console.error("");
  console.log("PASS");
} catch (err) {
  console.error("FAIL:", err);
  process.exitCode = 1;
} finally {
  await client.close();
}
