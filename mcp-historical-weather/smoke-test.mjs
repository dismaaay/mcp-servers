/**
 * Live smoke test for mcp-historical-weather.
 *
 * Spawns the built server over stdio, performs a real MCP handshake, lists tools,
 * and makes ONE real call to get_history against the live Open-Meteo Archive API.
 * Asserts the response is non-empty and contains real data, then prints PASS.
 *
 * Run with: node smoke-test.mjs   (after npm run build)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist/index.js");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
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
  if (!tools.length) fail("listTools() returned no tools");
  const names = tools.map((t) => t.name);
  console.error(`Tools: ${names.join(", ")}`);
  if (!names.includes("get_history")) fail("get_history tool not registered");

  // Real call: Berlin, first 3 days of 2024.
  const res = await client.callTool({
    name: "get_history",
    arguments: {
      latitude: 52.52,
      longitude: 13.41,
      start_date: "2024-01-01",
      end_date: "2024-01-03",
    },
  });

  if (res.isError) fail(`tool returned isError: ${JSON.stringify(res.content)}`);
  const text = res.content?.[0]?.text;
  if (!text || !text.trim()) fail("tool returned empty content");

  const data = JSON.parse(text);
  if (!Array.isArray(data.days) || data.days.length === 0) {
    fail("response contained no daily records");
  }
  const first = data.days[0];
  if (typeof first.temperature_max !== "number") {
    fail(`first day has no numeric temperature_max: ${JSON.stringify(first)}`);
  }

  console.error("--- Real returned data (first day) ---");
  console.error(JSON.stringify(first, null, 2));
  console.error(`Timezone: ${data.timezone}, days: ${data.summary.day_count}`);
  console.error(
    `Avg max temp: ${data.summary.avg_temperature_max}${data.units.temperature}, ` +
      `total precip: ${data.summary.total_precipitation}${data.units.precipitation}`
  );

  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  fail(err?.stack || String(err));
}
