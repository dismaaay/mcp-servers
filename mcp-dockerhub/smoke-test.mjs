#!/usr/bin/env node
/**
 * Live smoke test for mcp-dockerhub.
 *
 * Spawns the built server over stdio using the real MCP client, performs the
 * protocol handshake, lists tools, then makes ONE real tool call against the
 * live Docker Hub API and asserts the returned data is non-empty and sane.
 *
 * Exits 0 and prints "PASS" on success; non-zero on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist/index.js");

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });

  console.error("[smoke] connecting + handshake...");
  await client.connect(transport);
  console.error("[smoke] handshake OK");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error(`[smoke] tools: ${names.join(", ")}`);
  assert(names.includes("get_image"), "get_image tool registered");
  assert(names.includes("list_tags"), "list_tags tool registered");

  // 2) One real call -> get_image('nginx')
  console.error("[smoke] calling get_image('nginx')...");
  const res = await client.callTool({
    name: "get_image",
    arguments: { repo: "nginx" },
  });
  assert(!res.isError, `get_image returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");
  const text = res.content[0].text;
  assert(typeof text === "string" && text.length > 0, "text payload non-empty");

  const data = JSON.parse(text);
  assert(data.repository === "library/nginx", `repository is library/nginx (got ${data.repository})`);
  assert(typeof data.pull_count === "number" && data.pull_count > 0, "pull_count is a positive number");
  assert(typeof data.star_count === "number" && data.star_count > 0, "star_count is a positive number");
  assert(data.is_official === true, "nginx flagged as official");

  console.error("[smoke] sample data:");
  console.error(text);

  // 3) Bonus real call -> list_tags to prove the second tool works too.
  console.error("[smoke] calling list_tags('nginx', 3)...");
  const tagsRes = await client.callTool({
    name: "list_tags",
    arguments: { repo: "nginx", page_size: 3 },
  });
  assert(!tagsRes.isError, "list_tags returned an error");
  const tagsData = JSON.parse(tagsRes.content[0].text);
  assert(tagsData.total_count > 0, "list_tags total_count positive");
  assert(Array.isArray(tagsData.tags) && tagsData.tags.length > 0, "tags array non-empty");
  assert(typeof tagsData.tags[0].name === "string" && tagsData.tags[0].name.length > 0, "first tag has a name");
  console.error(`[smoke] first tag: ${tagsData.tags[0].name} (${tagsData.total_count} total)`);

  await client.close();

  console.log("PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
