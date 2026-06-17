/**
 * Live smoke test for mcp-nasa.
 *
 * Spawns the built server over stdio, performs a real MCP handshake, lists the
 * advertised tools, and makes ONE real tool call against the live NASA API.
 * Asserts the result is non-empty and prints PASS on success.
 *
 * Run with: node smoke-test.mjs   (after `npm run build`)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    stderr: "inherit",
  });

  const client = new Client(
    { name: "smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.error("[smoke] connected, handshake complete");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error(`[smoke] tools: ${names.join(", ")}`);
  assert(names.includes("apod"), "apod tool must be advertised");
  assert(
    names.includes("near_earth_objects"),
    "near_earth_objects tool must be advertised",
  );

  // 2) One REAL tool call against the live NASA API.
  // NASA's gateway can occasionally be slow on a cold cache, so retry a couple
  // of times before declaring failure — this is a live network test.
  let res;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await client.callTool({ name: "apod", arguments: {} });
    if (!res.isError) break;
    console.error(
      `[smoke] apod attempt ${attempt} failed, retrying: ${res.content?.[0]?.text ?? ""}`,
    );
    await new Promise((r) => setTimeout(r, 1500));
  }

  assert(!res.isError, `apod call returned an error: ${JSON.stringify(res)}`);
  assert(Array.isArray(res.content), "result must have content array");
  assert(res.content.length > 0, "content must be non-empty");

  const text = res.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  assert(text.trim().length > 0, "text content must be non-empty");

  // Parse the structured JSON block (second content item) to prove real data.
  const json = JSON.parse(res.content[1].text);
  assert(typeof json.title === "string" && json.title.length > 0, "apod must have a title");
  assert(typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date), "apod must have a date");
  assert(typeof json.explanation === "string" && json.explanation.length > 20, "apod must have an explanation");

  console.error("[smoke] real APOD data received:");
  console.error(`        title: ${json.title}`);
  console.error(`        date:  ${json.date}`);
  console.error(`        media: ${json.media_type}`);
  console.error(`        url:   ${json.url ?? json.hdurl}`);

  await client.close();

  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
