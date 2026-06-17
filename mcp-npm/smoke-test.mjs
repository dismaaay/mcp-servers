/**
 * Live smoke test for mcp-npm.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, performs the protocol handshake, lists tools, then makes ONE real
 * tool call against the live npm registry and asserts the response is real,
 * non-empty data. Prints PASS on success, exits non-zero on failure.
 *
 * Run:  node smoke-test.mjs
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

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });

  const client = new Client({ name: "smoke-test", version: "1.0.0" });

  console.log("• connecting + handshake...");
  await client.connect(transport);

  console.log("• listing tools...");
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("  tools:", names.join(", "));
  assert(names.includes("get_package"), "get_package tool present");
  assert(names.includes("search_packages"), "search_packages tool present");
  assert(names.includes("get_downloads"), "get_downloads tool present");

  // ---- ONE real tool call against the live registry ----
  console.log('• calling get_package("react")...');
  const res = await client.callTool({
    name: "get_package",
    arguments: { name: "react" },
  });

  assert(!res.isError, "get_package did not return an error");
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");
  const text = res.content[0].text;
  assert(typeof text === "string" && text.length > 0, "text payload non-empty");

  const pkg = JSON.parse(text);
  assert(pkg.name === "react", `name is react (got ${pkg.name})`);
  assert(typeof pkg.latestVersion === "string" && pkg.latestVersion.length > 0,
    "latestVersion present");
  assert(typeof pkg.description === "string" && pkg.description.length > 0,
    "description present");

  console.log("  -> name:", pkg.name);
  console.log("  -> latestVersion:", pkg.latestVersion);
  console.log("  -> license:", pkg.license);
  console.log("  -> description:", pkg.description);

  // Second sanity call: download stats (exercises the api.npmjs.org host).
  console.log('• calling get_downloads("react", last-week)...');
  const dl = await client.callTool({
    name: "get_downloads",
    arguments: { name: "react", period: "last-week" },
  });
  assert(!dl.isError, "get_downloads did not return an error");
  const dlData = JSON.parse(dl.content[0].text);
  assert(typeof dlData.downloads === "number" && dlData.downloads > 0,
    "downloads is a positive number");
  console.log("  -> downloads (last-week):", dlData.downloads.toLocaleString());

  await client.close();

  console.log("\nPASS");
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});
