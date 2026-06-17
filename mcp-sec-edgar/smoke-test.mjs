/**
 * Live smoke test for the SEC EDGAR MCP server.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists tools,
 * and makes ONE real tool call against the live SEC EDGAR API. Asserts the
 * response is non-empty and prints PASS. Exits non-zero on any failure.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: "inherit",
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  console.error("Handshake OK");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools:", names.join(", "));
  assert(names.includes("lookup_company"), "lookup_company present");
  assert(names.includes("get_recent_filings"), "get_recent_filings present");
  assert(names.includes("get_company_facts"), "get_company_facts present");

  // ONE real call against the live SEC API.
  const res = await client.callTool({
    name: "get_recent_filings",
    arguments: { ticker_or_name: "AAPL", limit: 3 },
  });

  assert(!res.isError, "tool call did not error: " + JSON.stringify(res.content));
  assert(Array.isArray(res.content) && res.content.length > 0, "content non-empty");

  const text = res.content.map((c) => c.text ?? "").join("\n");
  assert(text.length > 0, "text non-empty");
  assert(/Apple Inc\./i.test(text), "result mentions Apple Inc.");
  assert(/CIK 0000320193/.test(text), "result includes Apple CIK");
  assert(/sec\.gov\/Archives/i.test(text), "result includes EDGAR archive URL");

  const parsed = JSON.parse(res.content[res.content.length - 1].text);
  assert(parsed.filings.length > 0, "at least one filing returned");

  console.error("\n--- sample returned data ---");
  console.error(res.content[0].text.split("\n").slice(0, 5).join("\n"));
  console.error("----------------------------");
  console.error("\nPASS");
  await client.close();
  process.exit(0);
} catch (err) {
  console.error("\nFAIL:", err.message);
  try {
    await client.close();
  } catch {}
  process.exit(1);
}
