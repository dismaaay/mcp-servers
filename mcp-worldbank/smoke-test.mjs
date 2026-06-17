#!/usr/bin/env node
/**
 * Live smoke test for the World Bank MCP server.
 *
 * Spawns the built server over stdio, performs a real MCP handshake, lists the
 * tools, then makes ONE real tool call that hits the live World Bank API and
 * asserts the returned data is non-empty. Prints PASS on success.
 *
 * Run: node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.error("[smoke] connected, handshake OK");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("get_indicator"), "get_indicator tool present");
  assert(names.includes("search_indicators"), "search_indicators tool present");
  assert(names.includes("list_countries"), "list_countries tool present");

  // 2) ONE real tool call hitting the live API: Brazil GDP 2020-2022.
  const res = await client.callTool({
    name: "get_indicator",
    arguments: {
      country: "BRA",
      indicator: "NY.GDP.MKTP.CD",
      years: "2020:2022",
    },
  });

  assert(!res.isError, `tool returned error: ${JSON.stringify(res.content)}`);
  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  assert(text && text.trim().length > 0, "non-empty text content returned");

  const obs = res.structuredContent?.observations ?? [];
  assert(Array.isArray(obs) && obs.length > 0, "non-empty observations array");
  const withValue = obs.find((o) => typeof o.value === "number" && o.value > 0);
  assert(withValue, "at least one numeric observation value");

  console.error("[smoke] sample text output:\n" + text);
  console.error(
    `[smoke] real data: ${withValue.country} ${withValue.indicatorName} ` +
      `${withValue.date} = ${withValue.value}`,
  );

  await client.close();

  console.log("PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
