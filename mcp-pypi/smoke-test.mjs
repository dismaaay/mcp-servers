/**
 * Smoke test for mcp-pypi.
 *
 * Spawns the built server (dist/index.js) over stdio, performs the MCP
 * handshake, lists tools, and makes ONE real tool call against the live
 * PyPI API. Asserts the response is non-empty and looks like real data,
 * then prints PASS.
 *
 * Run after `npm run build`:  node smoke-test.mjs
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
    { name: "mcp-pypi-smoke-test", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log("✓ Handshake complete (connected to server)");

  // 1. List tools
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  console.log(`✓ Tools listed: ${toolNames.join(", ")}`);
  assert(toolNames.includes("get_package"), "get_package tool must exist");
  assert(toolNames.includes("get_releases"), "get_releases tool must exist");

  // 2. One real call: get_package("requests")
  const pkgRes = await client.callTool({
    name: "get_package",
    arguments: { name: "requests" },
  });
  assert(!pkgRes.isError, `get_package returned an error: ${JSON.stringify(pkgRes.content)}`);
  assert(Array.isArray(pkgRes.content) && pkgRes.content.length > 0, "get_package content must be non-empty");
  const pkgText = pkgRes.content.map((c) => c.text).join("\n");
  assert(pkgText.toLowerCase().includes("requests"), "get_package output must mention 'requests'");
  assert(/version|Requires Python|License/i.test(pkgText), "get_package output must contain metadata fields");
  console.log("✓ get_package('requests') returned real data");
  console.log("  ---- sample ----");
  console.log("  " + pkgText.split("\n").slice(0, 8).join("\n  "));
  console.log("  ----------------");

  // 3. Second real call to exercise get_releases too
  const relRes = await client.callTool({
    name: "get_releases",
    arguments: { name: "requests", limit: 5 },
  });
  assert(!relRes.isError, `get_releases returned an error: ${JSON.stringify(relRes.content)}`);
  const relText = relRes.content.map((c) => c.text).join("\n");
  assert(/releases/i.test(relText), "get_releases output must mention releases");
  const parsed = JSON.parse(relRes.content[relRes.content.length - 1].text);
  assert(Array.isArray(parsed.releases) && parsed.releases.length > 0, "get_releases must return release entries");
  assert(typeof parsed.total === "number" && parsed.total > 0, "get_releases total must be > 0");
  console.log(`✓ get_releases('requests') returned ${parsed.releases.length} of ${parsed.total} releases (latest ${parsed.latest})`);

  // 4. Error path: nonexistent package should return isError, not crash
  const errRes = await client.callTool({
    name: "get_package",
    arguments: { name: "this-package-does-not-exist-xyz123-abc" },
  });
  assert(errRes.isError === true, "nonexistent package must yield isError=true");
  console.log("✓ Error handling works (404 -> clean error result)");

  await client.close();
  console.log("\nPASS");
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});
