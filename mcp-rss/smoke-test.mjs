/**
 * Live smoke test for mcp-rss.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists tools,
 * and makes ONE real tool call against a public feed — asserting the result is
 * non-empty real data. Prints PASS on success, exits non-zero on failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist", "index.js");

// A stable, well-known public Atom feed (no key required).
const FEED_URL = "https://hnrss.org/frontpage";

function assert(cond, msg) {
  if (!cond) {
    console.error(`ASSERT FAILED: ${msg}`);
    process.exit(1);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client(
    { name: "mcp-rss-smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("handshake: connected to mcp-rss");

  // List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("tools:", names.join(", "));
  assert(names.includes("get_feed"), "get_feed tool must be registered");
  assert(names.includes("latest"), "latest tool must be registered");

  // ONE real call returning real data.
  console.log(`calling get_feed(url=${FEED_URL}, limit=3)…`);
  const res = await client.callTool({
    name: "get_feed",
    arguments: { url: FEED_URL, limit: 3 },
  });

  assert(!res.isError, `get_feed returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content must be non-empty");

  const textPart = res.content.find((c) => c.type === "text");
  assert(textPart && textPart.text.trim().length > 0, "text content must be non-empty");

  // The second text part is JSON — parse it and assert real items came back.
  const jsonPart = res.content.filter((c) => c.type === "text").at(-1);
  const data = JSON.parse(jsonPart.text);
  assert(data.count >= 1, "feed must contain at least 1 item");
  assert(Array.isArray(data.items) && data.items.length >= 1, "items array must be non-empty");
  const first = data.items[0];
  assert(typeof first.title === "string" && first.title.length > 0, "first item must have a title");
  assert(typeof first.link === "string" && first.link.startsWith("http"), "first item must have an http link");

  console.log("\n--- sample of real returned data ---");
  console.log(`feed title: ${data.title}`);
  console.log(`feed type:  ${data.feedType}`);
  console.log(`item 1 title: ${first.title}`);
  console.log(`item 1 link:  ${first.link}`);
  console.log(`item 1 date:  ${first.published}`);
  console.log("------------------------------------\n");

  // Also exercise latest() to be thorough.
  const latestRes = await client.callTool({
    name: "latest",
    arguments: { url: FEED_URL },
  });
  assert(!latestRes.isError, "latest returned an error");
  const latestJson = JSON.parse(latestRes.content.filter((c) => c.type === "text").at(-1).text);
  assert(typeof latestJson.title === "string" && latestJson.title.length > 0, "latest must return a titled item");
  console.log(`latest() title: ${latestJson.title}`);

  await client.close();
  console.log("\nPASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
