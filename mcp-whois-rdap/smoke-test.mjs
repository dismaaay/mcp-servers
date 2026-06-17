// Live MCP protocol smoke test.
// Spawns the built server over stdio, performs the MCP handshake, lists tools,
// and makes ONE real tool call against rdap.org. Asserts a non-empty,
// real result and prints PASS. Exits non-zero on any failure.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "dist", "index.js");

function assert(cond, msg) {
  if (!cond) {
    console.error(`ASSERT FAILED: ${msg}`);
    process.exit(1);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
});

const client = new Client(
  { name: "smoke-test", version: "1.0.0" },
  { capabilities: {} }
);

try {
  // 1) Handshake
  await client.connect(transport);
  console.log("handshake: OK");

  // 2) List tools
  const { tools } = await client.listTools();
  console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
  assert(tools.length >= 1, "expected at least one tool");
  const tool = tools.find((t) => t.name === "lookup_domain");
  assert(tool, "lookup_domain tool not registered");
  assert(
    tool.inputSchema && typeof tool.inputSchema === "object",
    "lookup_domain missing inputSchema"
  );

  // 3) One real tool call
  const domain = "example.com";
  const res = await client.callTool({
    name: "lookup_domain",
    arguments: { domain },
  });

  assert(!res.isError, `tool returned an error: ${JSON.stringify(res.content)}`);
  assert(Array.isArray(res.content) && res.content.length > 0, "empty content");
  const textBlock = res.content.find((c) => c.type === "text");
  assert(textBlock && textBlock.text.length > 0, "no non-empty text content");

  const text = textBlock.text;
  console.log("--- tool result (text) ---");
  console.log(text);
  console.log("--------------------------");

  // Real-data assertions: must contain the domain and a registration event.
  assert(
    text.toLowerCase().includes("example.com"),
    "result does not mention example.com"
  );
  assert(/Domain:/.test(text), "result missing Domain field");
  assert(
    /registration|expiration|Status:|Nameservers:/i.test(text),
    "result missing real RDAP fields"
  );

  // Structured content sanity check.
  if (res.structuredContent) {
    assert(
      res.structuredContent.domain &&
        res.structuredContent.domain.includes("example.com"),
      "structuredContent.domain mismatch"
    );
    console.log(
      `structuredContent.status = ${JSON.stringify(
        res.structuredContent.status
      )}`
    );
  }

  console.log("PASS");
  await client.close();
  process.exit(0);
} catch (err) {
  console.error("SMOKE TEST ERROR:", err);
  try {
    await client.close();
  } catch {}
  process.exit(1);
}
