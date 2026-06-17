/**
 * Live smoke test for mcp-worldtime.
 *
 * Spawns the built server (dist/index.js) over stdio using the official MCP
 * client, performs the protocol handshake, lists tools, then makes ONE real
 * tool call (get_time for Europe/Warsaw) against the live API and asserts the
 * response contains real, non-empty data.
 *
 * Exit code 0 + "PASS" on success; non-zero + "FAIL" otherwise.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "dist", "index.js");

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
    { name: "mcp-worldtime-smoke", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("→ Connecting + handshake…");
  await client.connect(transport);
  console.log("✓ Handshake OK");

  // 1) List tools
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("→ Tools:", names.join(", "));
  assert(names.includes("get_time"), "get_time tool registered");
  assert(names.includes("list_timezones"), "list_timezones tool registered");

  // 2) ONE real call against the live API.
  console.log("→ Calling get_time(Europe/Warsaw)…");
  const res = await client.callTool({
    name: "get_time",
    arguments: { timezone: "Europe/Warsaw" },
  });
  assert(!res.isError, `get_time returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "non-empty content");

  const textBlock = res.content.find((c) => c.type === "text");
  assert(textBlock && textBlock.text.length > 0, "non-empty text content");

  // The second text block is JSON — parse and validate real fields.
  const jsonBlock = res.content.filter((c) => c.type === "text").at(-1);
  const data = JSON.parse(jsonBlock.text);
  assert(data.timezone === "Europe/Warsaw", `timezone echoed: got ${data.timezone}`);
  assert(typeof data.datetime === "string" && data.datetime.length >= 10, "real datetime present");
  assert(/^\d{4}-\d{2}-\d{2}/.test(data.datetime), `datetime looks ISO: ${data.datetime}`);
  assert(typeof data.day_of_week === "string" && data.day_of_week.length > 0, "day_of_week present");
  assert(typeof data.source === "string" && data.source.length > 0, "source present");

  console.log("\n--- Real data returned by get_time(Europe/Warsaw) ---");
  console.log(textBlock.text);
  console.log("----------------------------------------------------");

  // 3) Bonus: list_timezones(Europe) — also a real call, proves second tool.
  console.log("\n→ Calling list_timezones(Europe)…");
  const tzRes = await client.callTool({
    name: "list_timezones",
    arguments: { area: "Europe" },
  });
  assert(!tzRes.isError, "list_timezones not an error");
  const tzJson = JSON.parse(tzRes.content.filter((c) => c.type === "text").at(-1).text);
  assert(tzJson.count > 0, "list_timezones returned timezones");
  assert(tzJson.timezones.includes("Europe/Warsaw"), "list includes Europe/Warsaw");
  console.log(`✓ list_timezones(Europe) -> ${tzJson.count} zones (source: ${tzJson.source})`);

  await client.close();

  console.log("\nPASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  process.exit(1);
});
