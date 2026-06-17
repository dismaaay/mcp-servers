/**
 * Live smoke test for mcp-openfda.
 *
 * Spawns the built server over stdio, performs the MCP handshake, lists tools,
 * then makes ONE real openFDA call and asserts it returns real, non-empty data.
 * Prints PASS on success, throws (non-zero exit) on any failure.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  stderr: "inherit",
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  console.error("[smoke] handshake OK");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));

  const expected = ["drug_adverse_events", "search_drug_labels", "search_recalls"];
  for (const name of expected) {
    if (!names.includes(name)) {
      throw new Error(`Missing expected tool: ${name}`);
    }
  }

  // ONE real call against the live openFDA API.
  const res = await client.callTool({
    name: "search_drug_labels",
    arguments: { query: "ibuprofen", limit: 1 },
  });

  if (res.isError) {
    throw new Error(`Tool returned error: ${JSON.stringify(res.content)}`);
  }

  const text = res.content?.[0]?.text ?? "";
  if (!text.trim()) throw new Error("Empty tool response");

  const payload = JSON.parse(text);
  if (!payload.results || payload.results.length === 0) {
    throw new Error("Tool returned no label results");
  }

  const first = payload.results[0];
  console.error(
    "[smoke] sample label:",
    JSON.stringify({
      brand_name: first.brand_name,
      generic_name: first.generic_name,
      manufacturer: first.manufacturer,
    }),
  );

  console.log("PASS");
} catch (err) {
  console.error("FAIL:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
