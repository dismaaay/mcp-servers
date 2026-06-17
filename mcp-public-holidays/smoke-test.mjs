/**
 * Live smoke test for mcp-public-holidays.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, lists the tools, then makes ONE real tool call that hits the live
 * Nager.Date API and asserts the response contains real holiday data.
 *
 * Exit code 0 + "PASS" on success; non-zero on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERTION FAILED:", msg);
    process.exit(1);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  console.error("Connected to server over stdio.");

  // 1) List tools.
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("Tools:", names.join(", "));
  assert(names.includes("holidays"), "missing tool: holidays");
  assert(names.includes("next_holidays"), "missing tool: next_holidays");
  assert(names.includes("is_holiday"), "missing tool: is_holiday");

  // 2) One real tool call against the live API.
  const res = await client.callTool({
    name: "holidays",
    arguments: { year: 2026, countryCode: "PL" },
  });
  assert(!res.isError, `tool returned error: ${JSON.stringify(res.content)}`);
  const text = res.content?.[0]?.text ?? "";
  console.error("Sample response from holidays(2026, PL):");
  console.error(text.split("\n").slice(0, 6).join("\n"));

  assert(text.length > 0, "empty tool response");
  assert(/Public holidays in PL/.test(text), "response missing expected header");
  assert(/2026-01-01/.test(text) && /New Year/.test(text), "response missing real holiday data");

  // 3) Second real call to exercise is_holiday.
  const res2 = await client.callTool({
    name: "is_holiday",
    arguments: { date: "2026-12-25", countryCode: "PL" },
  });
  const text2 = res2.content?.[0]?.text ?? "";
  console.error("Sample response from is_holiday(2026-12-25, PL):", text2);
  assert(/^Yes/.test(text2), "expected 2026-12-25 to be a holiday in PL");

  console.log("PASS");
  process.exit(0);
} catch (err) {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
