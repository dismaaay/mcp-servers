/**
 * Live smoke test for mcp-github-public.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists tools,
 * and makes ONE real call against the live GitHub API. Asserts the response is
 * non-empty and contains expected real data, then prints "PASS".
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
  if (!cond) {
    console.error(`ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.error("Connected to server over stdio.");

  // 1. List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools listed:", names.join(", "));
  const expected = ["get_repo", "get_user", "list_repos", "search_repos"];
  for (const e of expected) {
    assert(names.includes(e), `expected tool "${e}" to be registered`);
  }

  // 2. Real tool call against the live API
  const res = await client.callTool({
    name: "get_user",
    arguments: { username: "torvalds" },
  });
  assert(!res.isError, `get_user returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "content is empty");
  const text = res.content[0].text ?? "";
  assert(text.length > 0, "returned text is empty");
  assert(/torvalds/i.test(text), "expected returned data to mention 'torvalds'");
  console.error("Sample returned data:\n" + text.split("\n").slice(0, 3).join("\n"));

  // 3. A second real call exercising search
  const search = await client.callTool({
    name: "search_repos",
    arguments: { query: "mcp server language:typescript", per_page: 3 },
  });
  assert(!search.isError, "search_repos returned an error");
  const stext = search.content[0].text ?? "";
  assert(/repositories/i.test(stext), "search did not return repositories");
  console.error("Search sample:\n" + stext.split("\n").slice(0, 2).join("\n"));

  await client.close();
  console.log("PASS");
  process.exit(0);
} catch (err) {
  console.error("SMOKE TEST FAILED:", err);
  try {
    await client.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
