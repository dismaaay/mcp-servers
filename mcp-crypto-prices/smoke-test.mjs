/**
 * Live smoke test for mcp-crypto-prices.
 *
 * Spawns the built server (dist/index.js), connects a real MCP client over
 * stdio, lists the tools, then makes ONE real tool call against the live
 * CoinGecko API and asserts the result is non-empty. Prints PASS on success.
 *
 * Run with: node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);
  console.error("[smoke] connected to server over stdio");

  // 1. List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("get_price"), "get_price tool must be registered");
  assert(names.includes("trending"), "trending tool must be registered");
  assert(names.includes("market_top"), "market_top tool must be registered");

  // 2. One real tool call against the live API.
  const res = await client.callTool({
    name: "get_price",
    arguments: { ids: ["bitcoin", "ethereum"], vs_currency: "usd" },
  });

  assert(!res.isError, `tool call returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "tool result content must be non-empty");
  const text = res.content[0]?.text ?? "";
  assert(text.length > 0, "tool result text must be non-empty");
  assert(/bitcoin/i.test(text) && /USD/i.test(text), "result must contain live bitcoin/USD data");
  // Ensure a real number is present in the output (live price).
  assert(/\d[\d,]*\.?\d*/.test(text), "result must contain a numeric price");

  console.error("[smoke] --- live get_price(bitcoin, ethereum / usd) ---");
  console.error(text);
  console.error("[smoke] -------------------------------------------------");

  // 3. Exercise a second tool for good measure (market_top).
  const top = await client.callTool({
    name: "market_top",
    arguments: { limit: 3, vs_currency: "usd" },
  });
  assert(!top.isError, "market_top returned an error");
  const topText = top.content[0]?.text ?? "";
  assert(topText.length > 0, "market_top text must be non-empty");
  console.error("[smoke] --- live market_top(3) ---");
  console.error(topText);

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
