#!/usr/bin/env node
/**
 * Live smoke test for mcp-zip-postal.
 *
 * Spawns the built server over stdio, performs a real MCP handshake,
 * lists the tools, then makes ONE real tool call that hits the live
 * Zippopotam.us API. Asserts the result is non-empty and prints PASS.
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
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.error("[smoke] connected — handshake OK");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));
  assert(names.includes("lookup_postal"), "lookup_postal tool present");
  assert(names.includes("places_for_postal"), "places_for_postal tool present");

  // 2) ONE real tool call hitting the live API
  const res = await client.callTool({
    name: "lookup_postal",
    arguments: { country: "us", code: "90210" },
  });

  assert(res.isError !== true, `tool returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content is non-empty");

  const text = res.content[0].text;
  assert(typeof text === "string" && text.length > 0, "text payload is non-empty");

  const data = JSON.parse(text);
  assert(data.postCode === "90210", `postCode should be 90210, got ${data.postCode}`);
  assert(Array.isArray(data.places) && data.places.length > 0, "places non-empty");
  assert(
    data.places[0].placeName && data.places[0].placeName.length > 0,
    "first place has a name",
  );

  console.error("[smoke] live result:");
  console.error(text);

  await client.close();

  console.error("");
  console.error(
    `PASS — lookup_postal(us, 90210) => ${data.country}, ${data.places[0].placeName} ` +
      `(${data.places[0].stateAbbreviation}) @ ${data.places[0].latitude},${data.places[0].longitude}`,
  );
}

main().catch((err) => {
  console.error("FAIL:", err.message ?? err);
  process.exit(1);
});
