/**
 * Smoke test: spawns the built MCP server over stdio, performs a real
 * protocol handshake, lists tools, and makes ONE real tool call that hits
 * the live SpaceX API. Asserts the response is non-empty and prints PASS.
 *
 *   node smoke-test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = [
  "latest_launch",
  "next_launch",
  "get_rocket",
  "recent_launches",
];

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
  });

  const client = new Client(
    { name: "mcp-spacex-smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.error("[smoke] connected, handshake OK");

  // --- list tools ---
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.error("[smoke] tools:", names.join(", "));

  for (const expected of EXPECTED_TOOLS) {
    if (!names.includes(expected)) {
      throw new Error(`Missing expected tool: ${expected}`);
    }
  }

  // --- one real tool call against the live SpaceX API ---
  console.error("[smoke] calling get_rocket('Falcon 9')...");
  const res = await client.callTool({
    name: "get_rocket",
    arguments: { name_or_id: "Falcon 9" },
  });

  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  if (res.isError) {
    throw new Error(`Tool returned an error result: ${text}`);
  }
  if (!text) {
    throw new Error("Tool returned empty content");
  }
  if (!/Falcon 9/i.test(text)) {
    throw new Error(`Unexpected tool output (no rocket name):\n${text}`);
  }

  console.error("[smoke] --- real returned data ---");
  console.error(text);
  console.error("[smoke] -----------------------------");

  await client.close();
  console.log("PASS");
}

main().catch((err) => {
  console.error("FAIL:", err?.message ?? err);
  process.exit(1);
});
